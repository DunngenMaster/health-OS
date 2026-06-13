from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any


def _field_value(field: Any, fallback: Any = 0) -> Any:
    if isinstance(field, dict) and "value" in field:
        value = field.get("value", fallback)
        return fallback if value is None else value
    return field if field is not None else fallback


def _seed(hospital_id: str, salt: str) -> int:
    raw = f"{hospital_id}:{salt}".encode()
    return int(hashlib.sha256(raw).hexdigest()[:8], 16)


def _pick(hospital_id: str, salt: str, low: int, high: int) -> int:
    span = max(1, high - low + 1)
    return low + (_seed(hospital_id, salt) % span)


def _build_patient_flow(profile: dict[str, Any], hospital_id: str, total_beds: int, occupancy: int) -> dict[str, Any]:
    """Two-month patient flow — simulated operational telemetry (allowed synthetic layer)."""
    base_daily = max(40, int(total_beds * 0.35))
    ed_arrivals = _pick(hospital_id, "ed-arrivals", base_daily * 50, base_daily * 62)
    admissions = int(ed_arrivals * 0.28)
    discharges = int(admissions * 0.94)
    icu_transfers = _pick(hospital_id, "icu-xfer", 180, 320)
    avg_census = int(total_beds * (occupancy / 100))
    peak_occupancy = min(98, occupancy + _pick(hospital_id, "peak-occ", 4, 14))
    avg_ed_wait = _pick(hospital_id, "ed-wait", 38, 92)
    avg_dx_delay = _pick(hospital_id, "dx-delay", 22, 68)
    lwbs = _pick(hospital_id, "lwbs", 120, 380)

    throughput_by_week: list[dict[str, Any]] = []
    for week in range(8):
        factor = 1.0 + (0.08 if week in (2, 5) else 0.0)
        arrivals = int((ed_arrivals / 8) * factor)
        week_discharges = int((discharges / 8) * (0.95 + week * 0.01))
        throughput_by_week.append({
            "week": week + 1,
            "ed_arrivals": arrivals,
            "admissions": int(arrivals * 0.27),
            "discharges": week_discharges,
            "icu_admissions": int(icu_transfers / 8),
            "occupancy_pct": min(98, avg_census * 100 // max(1, total_beds) + _pick(hospital_id, f"occ-w{week}", -2, 5)),
        })

    bottleneck_departments: list[str] = []
    nurses = profile.get("nurses", {})
    if nurses.get("er_nurses", {}).get("count", 0) < 12:
        bottleneck_departments.append("Emergency")
    if nurses.get("icu_nurses", {}).get("count", 0) < 10:
        bottleneck_departments.append("ICU")
    if _pick(hospital_id, "imaging-bn", 0, 10) > 6:
        bottleneck_departments.append("Imaging")

    return {
        "period_days": 60,
        "data_source_type": "simulated",
        "ed_arrivals_total": ed_arrivals,
        "admissions_total": admissions,
        "discharges_total": discharges,
        "icu_transfers": icu_transfers,
        "average_daily_census": avg_census,
        "peak_occupancy_pct": peak_occupancy,
        "average_ed_wait_minutes": avg_ed_wait,
        "average_diagnosis_delay_minutes": avg_dx_delay,
        "left_without_being_seen": lwbs,
        "throughput_by_week": throughput_by_week,
        "bottleneck_departments": bottleneck_departments or ["Emergency"],
    }


def _build_hospital_log(
    profile: dict[str, Any],
    hospital_id: str,
    hospital_name: str,
    resource_gaps: list[str],
    end_date: datetime,
) -> list[dict[str, Any]]:
    """Operational hospital log entries over 60 days — simulated layer."""
    categories = [
        ("staffing", "ER nurse shortfall triggered surge staffing protocol", "Emergency", "high"),
        ("equipment", "CT scanner scheduled maintenance completed", "Imaging", "medium"),
        ("surge", "Regional incident alert — pre-positioned ICU overflow beds", "ICU", "high"),
        ("patient_safety", "Code blue cluster review — no individual attribution", "Cardiology", "medium"),
        ("throughput", "ED boarding exceeded 6h threshold — opened flex ward", "Emergency", "high"),
        ("staffing", "Locum cardiologist coverage arranged for weekend", "Cardiology", "medium"),
        ("equipment", "Ventilator fleet audit — 2 units flagged for service", "ICU", "medium"),
        ("surge", "Mass casualty drill completed with trauma and ER leads", "Trauma", "low"),
    ]

    events: list[dict[str, Any]] = []
    for index, (category, event, department, severity) in enumerate(categories):
        days_ago = _pick(hospital_id, f"log-{index}", 2, 58)
        ts = (end_date - timedelta(days=days_ago)).replace(hour=9 + (index % 8), minute=15).isoformat()
        events.append({
            "timestamp": ts,
            "category": category,
            "event": event,
            "department": department,
            "severity": severity,
            "hospital": hospital_name,
            "data_source_type": "simulated",
        })

    for gap in resource_gaps[:3]:
        events.append({
            "timestamp": (end_date - timedelta(days=_pick(hospital_id, gap, 5, 45))).isoformat(),
            "category": "capacity",
            "event": f"Recurring gap logged: {gap.replace('_', ' ')}",
            "department": "Operations",
            "severity": "high",
            "hospital": hospital_name,
            "data_source_type": "simulated",
        })

    events.sort(key=lambda item: item["timestamp"], reverse=True)
    return events


def _build_incident_reports(
    profile: dict[str, Any],
    hospital_id: str,
    hospital_name: str,
    resource_gaps: list[str],
    recommended_hires: list[str],
    active_scenario_incident: dict[str, Any] | None,
    end_date: datetime,
) -> list[dict[str, Any]]:
    """Historical incident reports plus active scenario when present."""
    reports: list[dict[str, Any]] = []

    historical_types = [
        ("multi_trauma_mva", "Multi-vehicle collision — 12 patients, 3 critical", 12, 3, 7, 2),
        ("cardiac_surge", "Regional cardiac event — 8 arrests in 4 hours", 8, 5, 2, 1),
        ("respiratory_outbreak", "Infectious respiratory cluster — isolation wing activated", 15, 2, 10, 3),
    ]

    for index, (incident_type, description, total, critical, moderate, minor) in enumerate(historical_types):
        days_ago = _pick(hospital_id, f"inc-{index}", 8, 52)
        reports.append({
            "incident_id": f"{hospital_id}-hist-{index + 1}",
            "date": (end_date - timedelta(days=days_ago)).date().isoformat(),
            "incident_type": incident_type,
            "description": description,
            "incoming_patients": {"total": total, "critical": critical, "moderate": moderate, "minor": minor},
            "outcomes": {
                "treated_successfully": total - 1,
                "transferred_to_other_hospitals": 1 if critical > 2 else 0,
                "deaths": 0,
                "death_details": [],
            },
            "bottlenecks": [
                {"type": gap, "description": gap.replace("_", " "), "impact": "medium", "delay_minutes": _pick(hospital_id, f"bn-{index}", 12, 45)}
                for gap in resource_gaps[:2]
            ],
            "lessons_learned": [
                "Pre-alert imaging before surge arrival reduces turnaround",
                "ICU boarding protocol needs earlier activation",
            ],
            "recommended_improvements": recommended_hires[:2],
            "data_source_type": "simulated",
        })

    if active_scenario_incident:
        reports.insert(0, active_scenario_incident)

    return reports


def generate_two_month_hospital_digest(profile: dict[str, Any]) -> dict[str, Any]:
    """
    Two-month hospital operational digest — the only synthetic data layer.
    Includes incident reports, patient flow, and hospital log.
    """
    hospital = profile.get("hospital_profile", {})
    hospital_id = hospital.get("hospital_id", "unknown")
    hospital_name = hospital.get("name", "Hospital")
    assignment = profile.get("capacity", {}).get("scenario_assignment", {})

    critical = int(_field_value(assignment.get("critical_patients"), 0) or 0)
    moderate = int(_field_value(assignment.get("non_critical_patients"), 0) or 0)
    total_assigned = int(_field_value(assignment.get("total_patients"), critical + moderate) or 0)
    minor = max(0, total_assigned - critical - moderate)
    total_inbound = critical + moderate + minor

    specialties: dict[str, int] = {}
    for doctor in profile.get("doctors", []):
        specialty = doctor.get("specialty", "Unknown")
        specialties[specialty] = specialties.get(specialty, 0) + 1

    nurses = profile.get("nurses", {})
    resource_gaps: list[str] = []
    recommended_hires: list[str] = []

    if nurses.get("icu_nurses", {}).get("count", 0) < 10:
        resource_gaps.append("icu_nurse_coverage_below_threshold")
        recommended_hires.append("4 ICU nurses")
    if nurses.get("er_nurses", {}).get("count", 0) < 12:
        resource_gaps.append("er_nurse_coverage_below_threshold")
        recommended_hires.append("3 ER nurses")
    if specialties.get("Emergency Medicine", 0) < 4:
        resource_gaps.append("emergency_physician_coverage_thin")
        recommended_hires.append("2 emergency physicians")

    total_beds = int(_field_value(profile.get("capacity", {}).get("total_beds"), 100) or 100)
    occupancy = int(_field_value(profile.get("capacity", {}).get("occupancy"), 72) or 72)
    if total_inbound > total_beds * 0.15:
        resource_gaps.append("scenario_load_exceeds_comfortable_surge_margin")

    equipment = {item.get("name"): item.get("count", 0) for item in profile.get("equipment", [])}
    end_date = datetime.now(timezone.utc)
    start_date = end_date - timedelta(days=60)

    active_scenario_incident: dict[str, Any] | None = None
    if total_inbound > 0:
        active_scenario_incident = {
            "incident_id": f"{hospital_id}-active-scenario",
            "date": end_date.date().isoformat(),
            "incident_type": "active_scenario",
            "description": f"Active map scenario: {critical} critical, {moderate} moderate, {minor} minor patients assigned to {hospital_name}.",
            "incoming_patients": {"total": total_inbound, "critical": critical, "moderate": moderate, "minor": minor},
            "hospital_state_at_arrival": {
                "available_beds": max(0, int(total_beds * (1 - occupancy / 100))),
                "available_icu_beds": nurses.get("icu_nurses", {}).get("count", 0),
                "er_load_percent": min(100, 40 + critical * 4),
                "available_doctors": {
                    "emergency_physicians": specialties.get("Emergency Medicine", 0),
                    "trauma_surgeons": specialties.get("Trauma Surgery", 0),
                    "cardiologists": specialties.get("Cardiology", 0),
                    "neurologists": specialties.get("Neurology", 0),
                },
                "available_nurses": {
                    "er_nurses": nurses.get("er_nurses", {}).get("count", 0),
                    "icu_nurses": nurses.get("icu_nurses", {}).get("count", 0),
                    "trauma_nurses": nurses.get("trauma_nurses", {}).get("count", 0),
                },
                "available_equipment": {
                    "ct_scanners": equipment.get("CT Scanner", 0),
                    "mri_machines": equipment.get("MRI Machine", 0),
                    "ventilators": equipment.get("Ventilator", 0),
                    "ambulances": equipment.get("Ambulance", 0),
                    "portable_ultrasound": equipment.get("Portable Ultrasound", 0),
                },
            },
            "outcomes": {"treated_successfully": 0, "transferred_to_other_hospitals": 0, "deaths": 0, "death_details": []},
            "bottlenecks": [
                {"type": gap, "description": gap.replace("_", " "), "impact": "medium", "delay_minutes": 0}
                for gap in resource_gaps
            ],
            "lessons_learned": [],
            "recommended_improvements": recommended_hires,
            "data_source_type": "estimated",
        }

    patient_flow = _build_patient_flow(profile, hospital_id, total_beds, occupancy)
    hospital_log = _build_hospital_log(profile, hospital_id, hospital_name, resource_gaps, end_date)
    incident_reports = _build_incident_reports(
        profile, hospital_id, hospital_name, resource_gaps, recommended_hires, active_scenario_incident, end_date
    )

    hist_incidents = [r for r in incident_reports if r.get("incident_type") != "active_scenario"]
    total_hist_patients = sum(r.get("incoming_patients", {}).get("total", 0) for r in hist_incidents)
    incident_types = list({r.get("incident_type", "unknown") for r in incident_reports})

    recommended_training = [
        "Mass casualty triage simulation",
        "Advanced disaster medicine training",
        "Ventilator management refresher",
    ]
    if "Imaging" in patient_flow.get("bottleneck_departments", []):
        recommended_training.append("Imaging throughput workflow workshop")

    return {
        "digest_metadata": {
            "hospital_id": hospital_id,
            "hospital_name": hospital_name,
            "digest_period": {"start_date": start_date.date().isoformat(), "end_date": end_date.date().isoformat()},
            "data_source_type": "simulated",
            "generated_at": end_date.isoformat(),
            "purpose": "Two-month operational digest: incident reports, patient flow, and hospital log for intelligence agents.",
        },
        "summary": {
            "total_incidents": len(incident_reports),
            "total_patients": total_hist_patients + total_inbound,
            "critical_patients": sum(r.get("incoming_patients", {}).get("critical", 0) for r in incident_reports),
            "moderate_patients": sum(r.get("incoming_patients", {}).get("moderate", 0) for r in incident_reports),
            "minor_patients": sum(r.get("incoming_patients", {}).get("minor", 0) for r in incident_reports),
            "total_deaths": 0,
            "preventable_deaths_estimate": 0,
            "average_er_wait_time_minutes": patient_flow["average_ed_wait_minutes"],
            "average_diagnosis_delay_minutes": patient_flow["average_diagnosis_delay_minutes"],
            "most_common_incident_types": incident_types,
            "most_common_resource_gaps": resource_gaps,
        },
        "incident_reports": incident_reports,
        "incidents": incident_reports,
        "patient_flow": patient_flow,
        "hospital_log": hospital_log,
        "two_month_learning_summary": {
            "patterns_detected": [g.replace("_", " ") for g in resource_gaps]
            + [f"ED boarding pressure — avg wait {patient_flow['average_ed_wait_minutes']} min"],
            "recurring_failures": [
                f"{dept} throughput constraint" for dept in patient_flow.get("bottleneck_departments", [])
            ],
            "highest_risk_departments": patient_flow.get("bottleneck_departments", ["Emergency", "ICU"]),
            "recommended_hires": recommended_hires,
            "recommended_training": recommended_training,
            "recommended_equipment_upgrades": [
                item.get("name") for item in profile.get("equipment", []) if item.get("count", 0) <= 2
            ],
            "recommended_process_changes": [
                "Reduce ED boarding using flex ward protocol from hospital log",
                "Pre-alert ICU when weekly occupancy exceeds 85%",
            ],
            "model_improvement_notes": [
                "Digest combines incident reports, patient flow, and hospital log — not profile-only estimates.",
            ],
        },
    }


generate_operational_context = generate_two_month_hospital_digest
