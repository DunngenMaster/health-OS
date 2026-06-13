import math
import re
from typing import Any

import httpx

from app.services.agents.utils import fetch_json

NPI_API = "https://npiregistry.cms.hhs.gov/api/"

SPECIALTY_QUERIES = [
    "Emergency Medicine",
    "Internal Medicine",
    "Trauma Surgery",
    "Critical Care Medicine",
    "General Surgery",
]


def _is_individual_provider(item: dict[str, Any]) -> bool:
    if item.get("enumeration_type") != "NPI-1":
        return False
    basic = item.get("basic") or {}
    return bool(basic.get("first_name") and basic.get("last_name"))


def _doctor_name_from_npi(item: dict[str, Any]) -> str | None:
    if not _is_individual_provider(item):
        return None

    basic = item.get("basic") or {}
    first = (basic.get("first_name") or "").strip().title()
    last = (basic.get("last_name") or "").strip().title()
    credential = (basic.get("credential") or "").strip()
    name = f"{first} {last}".strip()
    if not name:
        return None
    return f"{name}, {credential}" if credential else name


def _location_address(item: dict[str, Any]) -> dict[str, Any]:
    for address in item.get("addresses") or []:
        if address.get("address_purpose") == "LOCATION":
            return address
    addresses = item.get("addresses") or []
    return addresses[0] if addresses else {}


def _format_practice_location(address: dict[str, Any]) -> str:
    parts = [
        address.get("address_1", ""),
        address.get("city", ""),
        address.get("state", ""),
        (address.get("postal_code") or "")[:5],
    ]
    return ", ".join(part for part in parts if part)


def _extract_postal_code(address: str) -> str | None:
    match = re.search(r"\b(\d{5})(?:-\d{4})?\b", address or "")
    return match.group(1) if match else None


def _extract_city(address: str) -> str:
    match = re.search(r",\s*([^,]+),\s*[A-Z]{2}\b", address or "")
    return match.group(1).strip().upper() if match else "SAN FRANCISCO"


GENERIC_KEYWORDS = {
    "hospital", "medical", "center", "centre", "health", "general", "francisco",
    "california", "san", "the", "and", "care", "clinic", "memorial", "regional",
}


def _hospital_keywords(hospital_name: str) -> list[str]:
    lowered = hospital_name.lower()
    tokens = [
        token for token in re.split(r"[^a-z0-9]+", lowered)
        if len(token) >= 5 and token not in GENERIC_KEYWORDS
    ]
    keywords = set(tokens)

    if "zuckerberg" in lowered:
        keywords.add("zuckerberg")
    if "ucsf" in lowered:
        keywords.add("ucsf")
    if "pacific medical" in lowered or "cpmc" in lowered:
        keywords.update(["pacific", "buchanan"])
    if "chinese hospital" in lowered:
        keywords.add("chinese")

    return list(keywords)


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lng2 - lng1)
    a = math.sin(d_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    return radius * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


async def _geocode_postal_code(
    client: httpx.AsyncClient,
    address: str,
    lat: float,
    lng: float,
) -> str | None:
    existing = _extract_postal_code(address)
    if existing:
        return existing

    try:
        response = await client.get(
            "https://nominatim.openstreetmap.org/reverse",
            params={"lat": lat, "lon": lng, "format": "json"},
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        return (data.get("address") or {}).get("postcode", "")[:5] or None
    except Exception:
        return None


def _affiliation_for_provider(
    practice_address: dict[str, Any],
    hospital_profile: dict[str, Any],
    hospital_postal: str | None,
) -> tuple[str, str, str]:
    hospital_name = hospital_profile.get("name", "")
    hospital_city = _extract_city(hospital_profile.get("address", ""))
    practice_postal = (practice_address.get("postal_code") or "")[:5]
    practice_city = (practice_address.get("city") or "").upper()
    practice_text = _format_practice_location(practice_address).lower()

    if hospital_postal and practice_postal == hospital_postal:
        return "at_hospital", hospital_name, "Practice ZIP matches selected hospital location"

    for keyword in _hospital_keywords(hospital_name):
        if keyword in practice_text:
            return "at_hospital", hospital_name, f"Practice address matches hospital keyword ({keyword})"

    if hospital_postal and practice_postal and practice_postal[:3] == hospital_postal[:3]:
        return "nearby_zip", _format_practice_location(practice_address), "Nearby ZIP prefix only; affiliation not verified"

    if practice_city == hospital_city:
        return "same_city", _format_practice_location(practice_address), "Same city; affiliation with selected hospital not verified"

    return "other_area", _format_practice_location(practice_address), "Different practice location; not verified at selected hospital"


def _record_from_npi(
    item: dict[str, Any],
    hospital_profile: dict[str, Any],
    hospital_postal: str | None,
    source: str,
    require_hospital_match: bool,
) -> dict[str, Any] | None:
    doctor_name = _doctor_name_from_npi(item)
    if not doctor_name:
        return None

    practice_address = _location_address(item)
    affiliation, organization, affiliation_note = _affiliation_for_provider(
        practice_address, hospital_profile, hospital_postal
    )

    if require_hospital_match and affiliation != "at_hospital":
        return None

    taxonomies = item.get("taxonomies") or []
    primary_taxonomy = next((t for t in taxonomies if t.get("primary")), taxonomies[0] if taxonomies else {})

    return {
        "name": doctor_name,
        "specialty": primary_taxonomy.get("desc", "General Practice"),
        "organization": organization,
        "practice_location": _format_practice_location(practice_address),
        "affiliation_match": affiliation,
        "npi": item.get("number", ""),
        "data_source_type": "real",
        "source": f"{source} — {affiliation_note}",
    }


async def _search_individuals(
    client: httpx.AsyncClient,
    params: dict[str, Any],
    hospital_profile: dict[str, Any],
    hospital_postal: str | None,
    source: str,
    require_hospital_match: bool,
    limit: int = 10,
) -> list[dict[str, Any]]:
    query = {
        "version": "2.1",
        "enumeration_type": "NPI-1",
        "limit": limit,
        **params,
    }
    data = await fetch_json(client, NPI_API, query)
    doctors: list[dict[str, Any]] = []
    for item in (data or {}).get("results") or []:
        record = _record_from_npi(
            item,
            hospital_profile,
            hospital_postal,
            source,
            require_hospital_match=require_hospital_match,
        )
        if record:
            doctors.append(record)
    return doctors


async def run_physician_agent(
    client: httpx.AsyncClient,
    hospital_profile: dict[str, Any],
) -> dict[str, Any]:
    hospital_name = hospital_profile.get("name", "")
    address = hospital_profile.get("address", "")
    lat = hospital_profile.get("coordinates", {}).get("lat", 0)
    lng = hospital_profile.get("coordinates", {}).get("lng", 0)
    hospital_city = _extract_city(address)
    hospital_postal = await _geocode_postal_code(client, address, lat, lng)

    doctors: list[dict[str, Any]] = []
    seen_npis: set[str] = set()

    def add_doctors(candidates: list[dict[str, Any]]) -> None:
        for doctor in candidates:
            npi = doctor.get("npi", "")
            if not npi or npi in seen_npis:
                continue
            seen_npis.add(npi)
            doctors.append(doctor)

    if hospital_postal:
        for specialty in SPECIALTY_QUERIES:
            if len(doctors) >= 8:
                break
            found = await _search_individuals(
                client,
                {
                    "state": "CA",
                    "postal_code": hospital_postal,
                    "taxonomy_description": specialty,
                },
                hospital_profile,
                hospital_postal,
                f"NPI Registry — {specialty} at hospital ZIP {hospital_postal}",
                require_hospital_match=True,
                limit=8,
            )
            add_doctors(found)

    if len(doctors) < 4 and hospital_city:
        for specialty in SPECIALTY_QUERIES[:3]:
            if len(doctors) >= 8:
                break
            found = await _search_individuals(
                client,
                {
                    "state": "CA",
                    "city": hospital_city.title(),
                    "taxonomy_description": specialty,
                },
                hospital_profile,
                hospital_postal,
                f"NPI Registry — {specialty} in {hospital_city.title()} (hospital-affiliation filter applied)",
                require_hospital_match=True,
                limit=12,
            )
            add_doctors(found)

    match_note = (
        f"Showing physicians with a practice location matching {hospital_name} (ZIP or hospital address)."
        if doctors
        else f"No NPI-1 physicians with a verified practice location at {hospital_name} were found in public registry data."
    )

    return {
        "status": "completed",
        "doctors": doctors[:10],
        "note": (
            f"{match_note} Public registry only — on-duty status and employment are not available."
        ),
        "coordinates_checked": {"lat": lat, "lng": lng},
        "hospital_postal_code": hospital_postal,
    }
