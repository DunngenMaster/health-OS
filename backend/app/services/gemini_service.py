from datetime import datetime, timezone

from app.schemas.scenario import ScenarioFormRequest, ScenarioRequest
from app.services.hospital_service import analyze_scenario_with_impacts
from app.services.location_agent import resolve_location_coordinates, scenario_id_from_name


async def analyze_scenario(payload: ScenarioRequest):
    return await analyze_scenario_with_impacts(payload)


async def prepare_scenario_from_form(payload: ScenarioFormRequest) -> dict:
    coords = await resolve_location_coordinates(payload.location_name)
    return {
        "id": payload.id or scenario_id_from_name(payload.name),
        "name": payload.name,
        "type": payload.type,
        "location": {
            "name": str(coords["resolved_name"]),
            "latitude": coords["latitude"],
            "longitude": coords["longitude"],
        },
        "summary": {
            "injured": payload.injured,
            "critical": payload.critical,
            "severity": payload.severity,
        },
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "status": "active",
        "location_agent": "Gemini Location Geocoding Agent",
    }
