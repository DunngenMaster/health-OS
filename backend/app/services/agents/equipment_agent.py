from typing import Any


async def run_equipment_agent(
    capacity: dict[str, Any],
    hospital_profile: dict[str, Any],
) -> dict[str, Any]:
    assignment = capacity.get("scenario_assignment", {})
    total_beds = assignment.get("total_patients", {}).get("value") or 200
    icu_beds = assignment.get("critical_patients", {}).get("value") or 20
    hospital_type = hospital_profile.get("hospital_type", "hospital")
    name = hospital_profile.get("name", "")

    is_large = total_beds >= 250 or "medical center" in name.lower()

    equipment = [
        {
            "name": "CT Scanner",
            "count": 2 if is_large else 1,
            "data_source_type": "estimated",
            "source": "Typical acute hospital imaging inventory",
        },
        {
            "name": "MRI Machine",
            "count": 2 if is_large else 1,
            "data_source_type": "estimated",
            "source": "Typical acute hospital imaging inventory",
        },
        {
            "name": "Ventilator",
            "count": max(8, icu_beds),
            "data_source_type": "simulated",
            "source": "Modeled ICU ventilator reserve",
        },
        {
            "name": "Ambulance",
            "count": 3 if is_large else 2,
            "data_source_type": "estimated",
            "source": "Estimated hospital-based transport units",
        },
        {
            "name": "ICU Monitor",
            "count": icu_beds,
            "data_source_type": "simulated",
            "source": "Modeled 1 monitor per ICU bed",
        },
    ]

    if "emergency" in hospital_type.lower() or hospital_profile.get("emergency_department", {}).get("value"):
        equipment.append({
            "name": "Emergency Trauma Bay",
            "count": 4 if is_large else 2,
            "data_source_type": "estimated",
            "source": "Estimated ED trauma capacity",
        })

    return {"status": "completed", "equipment": equipment}
