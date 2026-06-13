from typing import Any

import httpx

from app.schemas.hospital_intelligence import HospitalIntelligenceRequest
from app.services.agents.utils import field_value


async def run_capacity_agent(
    client: httpx.AsyncClient,
    hospital_profile: dict[str, Any],
    payload: HospitalIntelligenceRequest | None = None,
) -> dict[str, Any]:
    _ = client

    critical = payload.critical_assigned if payload else None
    non_critical = payload.non_critical_assigned if payload else None
    total = payload.patients_assigned if payload else None

    if total is None and critical is not None and non_critical is not None:
        total = critical + non_critical
    if critical is None and non_critical is None and total is not None:
        critical, non_critical = max(1, int(total * 0.2)), max(0, total - max(1, int(total * 0.2)))

    capacity = {
        "scenario_assignment": {
            "critical_patients": field_value(
                critical,
                "estimated" if critical is not None else "unavailable",
                "Gemini scenario dispatch estimate for critical patients",
            ),
            "non_critical_patients": field_value(
                non_critical,
                "estimated" if non_critical is not None else "unavailable",
                "Gemini scenario dispatch estimate for non-critical patients",
            ),
            "total_patients": field_value(
                total,
                "estimated" if total is not None else "unavailable",
                "Total patients assigned to this hospital for the active scenario",
            ),
            "eta_minutes": field_value(
                payload.eta_minutes if payload else None,
                "real" if payload and payload.eta_minutes is not None else "unavailable",
                "Mapbox optimal driving-traffic route",
            ),
            "distance_km": field_value(
                payload.distance_km if payload else None,
                "real" if payload and payload.distance_km is not None else "unavailable",
                "Mapbox optimal driving-traffic route",
            ),
            "congestion": field_value(
                payload.congestion if payload else None,
                "real" if payload and payload.congestion else "unavailable",
                "Mapbox traffic annotations",
            ),
            "impact_zone": field_value(
                payload.impact_zone if payload else None,
                "real" if payload and payload.impact_zone else "unavailable",
                "Active scenario impact zone",
            ),
        },
        "total_beds": field_value(None, "unavailable", "Public bed inventory not used; scenario assignment shown instead"),
        "icu_beds": field_value(None, "unavailable"),
        "emergency_services": hospital_profile.get("emergency_department") or field_value(None, "unavailable"),
        "trauma_level": field_value(None, "unavailable"),
        "occupancy": field_value(None, "unavailable", "Real-time occupancy not publicly available"),
    }

    return {"status": "completed", "capacity": capacity}
