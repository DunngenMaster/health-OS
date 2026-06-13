import os
from typing import Any

import httpx

from app.services.agents.utils import fetch_json, fetch_overpass, field_value, make_hospital_id


async def run_identity_agent(
    client: httpx.AsyncClient,
    *,
    name: str,
    latitude: float,
    longitude: float,
    address: str | None = None,
    place_id: str | None = None,
    mapbox_id: str | None = None,
) -> dict[str, Any]:
    sources: list[str] = []
    profile: dict[str, Any] = {
        "hospital_id": make_hospital_id(name, latitude, longitude),
        "name": name,
        "address": address or "",
        "coordinates": {"lat": latitude, "lng": longitude},
        "phone": "",
        "website": "",
        "hospital_type": "general",
        "emergency_department": field_value(None, "unavailable"),
        "data_confidence": "low",
        "sources": sources,
    }

    mapbox_token = os.getenv("MAPBOX_ACCESS_TOKEN") or os.getenv("VITE_MAPBOX_TOKEN")
    if mapbox_token:
        search_url = "https://api.mapbox.com/search/searchbox/v1/forward"
        params = {
            "q": name,
            "proximity": f"{longitude},{latitude}",
            "types": "poi",
            "limit": 3,
            "access_token": mapbox_token,
        }
        data = await fetch_json(client, search_url, params)
        features = (data or {}).get("features") or []
        if features:
            best = features[0]
            props = best.get("properties") or {}
            coords = (best.get("geometry") or {}).get("coordinates") or [longitude, latitude]
            profile["name"] = props.get("name") or props.get("full_address") or name
            profile["address"] = props.get("full_address") or props.get("place_formatted") or profile["address"]
            profile["coordinates"] = {"lat": coords[1], "lng": coords[0]}
            profile["phone"] = props.get("metadata", {}).get("phone") or props.get("tel") or ""
            profile["website"] = props.get("metadata", {}).get("website") or ""
            profile["hospital_type"] = props.get("poi_category", ["hospital"])[0] if props.get("poi_category") else "hospital"
            profile["mapbox_id"] = props.get("mapbox_id") or mapbox_id or ""
            profile["place_id"] = props.get("external_ids", {}).get("foursquare") or place_id or ""
            sources.append("Mapbox Search API")
            profile["data_confidence"] = "medium"

    overpass_query = f"""
    [out:json][timeout:20];
    (
      node["amenity"="hospital"](around:800,{latitude},{longitude});
      way["amenity"="hospital"](around:800,{latitude},{longitude});
    );
    out center tags 5;
    """
    overpass_data = await fetch_overpass(client, overpass_query)
    elements = (overpass_data or {}).get("elements") or []
    if elements:
        element = elements[0]
        tags = element.get("tags") or {}
        center = element.get("center") or {}
        profile["name"] = tags.get("name", profile["name"])
        if tags.get("addr:full"):
            profile["address"] = tags["addr:full"]
        elif tags.get("addr:street"):
            profile["address"] = f"{tags.get('addr:housenumber', '')} {tags['addr:street']}, {tags.get('addr:city', 'San Francisco')}".strip()
        if center:
            profile["coordinates"] = {"lat": center.get("lat", latitude), "lng": center.get("lon", longitude)}
        profile["phone"] = tags.get("phone") or tags.get("contact:phone") or profile["phone"]
        profile["website"] = tags.get("website") or tags.get("contact:website") or profile["website"]
        profile["hospital_type"] = tags.get("healthcare") or tags.get("amenity") or profile["hospital_type"]
        if tags.get("emergency") == "yes":
            profile["emergency_department"] = field_value(True, "real", "OpenStreetMap")
        sources.append("OpenStreetMap / Overpass API")
        if profile["data_confidence"] == "low":
            profile["data_confidence"] = "medium"

    if not profile["address"]:
        profile["address"] = address or f"Near {latitude:.4f}, {longitude:.4f}"

    profile["sources"] = sources
    return {"status": "completed", "hospital_profile": profile}
