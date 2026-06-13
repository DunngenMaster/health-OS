from typing import Any


def _nurse_count(beds: int, ratio: float) -> int:
    return max(2, int(round(beds / ratio)))


async def run_nursing_agent(
    capacity: dict[str, Any],
    hospital_profile: dict[str, Any],
) -> dict[str, Any]:
    assignment = capacity.get("scenario_assignment", {})
    total_beds = assignment.get("total_patients", {}).get("value") or 200
    icu_beds = assignment.get("critical_patients", {}).get("value") or 20

    nurses = {
        "er_nurses": {
            "count": _nurse_count(max(20, int(total_beds * 0.08)), 4),
            "data_source_type": "simulated",
            "source": "Modeled from typical ER staffing ratios; no public nurse roster available",
        },
        "icu_nurses": {
            "count": _nurse_count(icu_beds, 2),
            "data_source_type": "simulated",
            "source": "Modeled ICU nurse-to-bed ratio (1:2)",
        },
        "trauma_nurses": {
            "count": _nurse_count(max(10, int(total_beds * 0.04)), 3),
            "data_source_type": "simulated",
            "source": "Modeled trauma team staffing",
        },
        "general_ward_nurses": {
            "count": _nurse_count(max(40, total_beds - icu_beds), 5),
            "data_source_type": "simulated",
            "source": "Modeled ward nurse-to-bed ratio (1:5)",
        },
    }

    return {
        "status": "completed",
        "nurses": nurses,
        "note": f"No public nurse staffing feed for {hospital_profile.get('name', 'hospital')}",
    }
