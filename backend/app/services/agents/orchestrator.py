from typing import Any

import httpx

from app.schemas.hospital_intelligence import HospitalIntelligenceRequest
from app.services.agents.capacity_agent import run_capacity_agent
from app.services.agents.equipment_agent import run_equipment_agent
from app.services.agents.identity_agent import run_identity_agent
from app.services.agents.nursing_agent import run_nursing_agent
from app.services.agents.physician_agent import run_physician_agent
from app.services.agents.recommendation_agent import run_recommendation_agent
from app.services.agents.utils import save_hospital_profile, utc_now


def _confidence_from_sources(profile: dict[str, Any], doctors: list[dict[str, Any]]) -> str:
    sources = profile.get("sources") or []
    if len(sources) >= 2 and len(doctors) >= 5:
        return "high"
    if sources or doctors:
        return "medium"
    return "low"


async def run_orchestrator(payload: HospitalIntelligenceRequest) -> dict[str, Any]:
    agent_status: dict[str, str] = {}

    async with httpx.AsyncClient(headers={"User-Agent": "HealthOS-HospitalIntelligence/1.0"}) as client:
        identity_result = await run_identity_agent(
            client,
            name=payload.name,
            latitude=payload.latitude,
            longitude=payload.longitude,
            address=payload.address,
            place_id=payload.place_id,
            mapbox_id=payload.mapbox_id,
        )
        agent_status["identity"] = identity_result["status"]
        hospital_profile = identity_result["hospital_profile"]

        capacity_result = await run_capacity_agent(client, hospital_profile, payload)
        agent_status["capacity"] = capacity_result["status"]
        capacity = capacity_result["capacity"]

        physician_result = await run_physician_agent(client, hospital_profile)
        agent_status["physician"] = physician_result["status"]
        doctors = physician_result["doctors"]

        nursing_result = await run_nursing_agent(capacity, hospital_profile)
        agent_status["nursing"] = nursing_result["status"]
        nurses = nursing_result["nurses"]

        equipment_result = await run_equipment_agent(capacity, hospital_profile)
        agent_status["equipment"] = equipment_result["status"]
        equipment = equipment_result["equipment"]

        recommendation_result = await run_recommendation_agent(
            hospital_profile,
            capacity,
            doctors,
            nurses,
            equipment,
            patients_assigned=payload.patients_assigned,
            critical_assigned=payload.critical_assigned,
            non_critical_assigned=payload.non_critical_assigned,
            eta_minutes=payload.eta_minutes,
            impact_zone=payload.impact_zone,
        )
        agent_status["recommendation"] = recommendation_result["status"]

    hospital_profile["data_confidence"] = _confidence_from_sources(hospital_profile, doctors)

    merged: dict[str, Any] = {
        "hospital_profile": hospital_profile,
        "capacity": capacity,
        "doctors": doctors,
        "nurses": nurses,
        "equipment": equipment,
        "ai_recommendation": recommendation_result["ai_recommendation"],
        "collected_at": utc_now(),
        "agent_status": agent_status,
    }

    save_hospital_profile(hospital_profile["hospital_id"], merged)
    return merged
