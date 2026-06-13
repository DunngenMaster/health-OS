from __future__ import annotations

from typing import Any


def _field_value(field: Any, fallback: Any = 0) -> Any:
    if isinstance(field, dict) and "value" in field:
        value = field.get("value", fallback)
        if value is None:
            return fallback
        return value
    return field if field is not None else fallback


def _numeric_field(field: Any, fallback: int = 0) -> int:
    value = _field_value(field, fallback)
    try:
        return int(round(float(value)))
    except (TypeError, ValueError):
        return fallback


def compute_surge_capacity(profile: dict[str, Any]) -> dict[str, Any]:
    capacity = profile.get("capacity", {})
    nurses = profile.get("nurses", {})

    total_beds = _numeric_field(capacity.get("total_beds"), 180)
    icu_beds = _numeric_field(capacity.get("icu_beds"), max(12, round(total_beds * 0.1)))
    occupancy = _numeric_field(capacity.get("occupancy"), 72)
    available_beds = max(0, round(total_beds * (1 - occupancy / 100)))
    er_nurses = nurses.get("er_nurses", {}).get("count", 0)
    icu_nurses = nurses.get("icu_nurses", {}).get("count", 0)

    critical_slots = max(2, round(icu_beds * (1 - occupancy / 100) + icu_nurses * 0.4 + er_nurses * 0.25))
    moderate_slots = max(4, round(available_beds * 0.32))
    minor_slots = max(8, round(available_beds * 0.42))

    return {
        "critical_slots": critical_slots,
        "moderate_slots": moderate_slots,
        "minor_slots": minor_slots,
        "total_beds": total_beds,
        "icu_beds": icu_beds,
        "available_beds": available_beds,
        "occupancy_pct": occupancy,
        "er_nurses": er_nurses,
        "icu_nurses": icu_nurses,
        "methodology": "Derived from licensed bed count, ICU capacity, occupancy, and nurse staffing.",
    }


def compute_pressure_score(incoming: dict[str, int], surge: dict[str, Any]) -> int:
    ratios = [
        incoming.get("critical", 0) / max(1, surge["critical_slots"]),
        incoming.get("moderate", 0) / max(1, surge["moderate_slots"]),
        incoming.get("minor", 0) / max(1, surge["minor_slots"]),
    ]
    return min(100, round((sum(ratios) / 3) * 100))


def run_capacity_simulation(profile: dict[str, Any], incoming: dict[str, int]) -> dict[str, Any]:
    surge = compute_surge_capacity(profile)
    capacity = {
        "critical": surge["critical_slots"],
        "moderate": surge["moderate_slots"],
        "minor": surge["minor_slots"],
        "total": surge["critical_slots"] + surge["moderate_slots"] + surge["minor_slots"],
    }

    critical_ok = incoming.get("critical", 0) <= capacity["critical"]
    moderate_ok = incoming.get("moderate", 0) <= capacity["moderate"]
    minor_ok = incoming.get("minor", 0) <= capacity["minor"]
    can_handle = critical_ok and moderate_ok and minor_ok

    overflow = {
        "critical": max(0, incoming.get("critical", 0) - capacity["critical"]),
        "moderate": max(0, incoming.get("moderate", 0) - capacity["moderate"]),
        "minor": max(0, incoming.get("minor", 0) - capacity["minor"]),
    }

    pressure_score = compute_pressure_score(incoming, surge)
    verdict = (
        "Incoming load fits within modeled hospital surge capacity."
        if can_handle
        else "Incoming load exceeds modeled surge capacity. Consider rerouting overflow patients."
    )

    if not can_handle:
        parts = []
        if overflow["critical"]:
            parts.append(f"{overflow['critical']} critical")
        if overflow["moderate"]:
            parts.append(f"{overflow['moderate']} moderate")
        if overflow["minor"]:
            parts.append(f"{overflow['minor']} minor")
        routing_advice = (
            f"Incoming load exceeds surge capacity ({surge['available_beds']} beds available at "
            f"{surge['occupancy_pct']}% occupancy). Reroute {', '.join(parts)} patients to partner facilities."
        )
    elif pressure_score >= 75:
        routing_advice = "Hospital can absorb this load but at high pressure — activate surge staffing and pre-alert ICU."
    else:
        routing_advice = (
            f"Hospital has capacity for this load with "
            f"{max(0, capacity['critical'] - incoming.get('critical', 0))} critical, "
            f"{max(0, capacity['moderate'] - incoming.get('moderate', 0))} moderate, and "
            f"{max(0, capacity['minor'] - incoming.get('minor', 0))} minor slots remaining."
        )

    return {
        "can_handle": can_handle,
        "verdict": verdict,
        "critical_ok": critical_ok,
        "moderate_ok": moderate_ok,
        "minor_ok": minor_ok,
        "pressure_score": pressure_score,
        "total_incoming": incoming.get("critical", 0) + incoming.get("moderate", 0) + incoming.get("minor", 0),
        "capacity": capacity,
        "overflow": overflow,
        "routing_advice": routing_advice,
        "surge": surge,
    }
