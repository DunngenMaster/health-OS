import re
from typing import Any

import httpx

CMS_HOSPITAL_API = "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0"


def _extract_zip(address: str) -> str | None:
    match = re.search(r"\b(\d{5})(?:-\d{4})?\b", address)
    return match.group(1) if match else None


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", name.lower())


async def fetch_cms_hospital_data(hospital_name: str, address: str = "") -> dict[str, Any] | None:
    zip_code = _extract_zip(address)
    if not zip_code:
        return None

    params: dict[str, Any] = {
        "conditions[0][property]": "zip_code",
        "conditions[0][value]": zip_code,
        "conditions[0][operator]": "=",
        "limit": 25,
    }

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            response = await client.get(CMS_HOSPITAL_API, params=params)
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return None

    results = payload.get("results") or []
    if not results:
        return None

    target = _normalize_name(hospital_name)
    best = None
    best_score = 0
    for row in results:
        facility_name = row.get("facility_name", "")
        normalized = _normalize_name(facility_name)
        score = 0
        if target and target in normalized:
            score += 3
        if normalized and normalized in target:
            score += 2
        for token in target.split()[:3]:
            if token and token in normalized:
                score += 1
        if score > best_score:
            best_score = score
            best = row

    if not best:
        best = results[0]

    return {
        "facility_name": best.get("facility_name"),
        "facility_id": best.get("facility_id"),
        "address": best.get("address"),
        "city": best.get("citytown"),
        "state": best.get("state"),
        "zip_code": best.get("zip_code"),
        "hospital_type": best.get("hospital_type"),
        "hospital_ownership": best.get("hospital_ownership"),
        "emergency_services": best.get("emergency_services"),
        "bed_count": _safe_int(best.get("number_of_beds")),
        "source": "CMS Hospital General Information (data.cms.gov)",
        "data_source_type": "real",
    }


def _safe_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(str(value).replace(",", "")))
    except (TypeError, ValueError):
        return None
