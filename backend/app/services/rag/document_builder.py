from typing import Any


def _field_value(field: Any, fallback: Any = 0) -> Any:
    if isinstance(field, dict) and "value" in field:
        value = field.get("value", fallback)
        return fallback if value is None else value
    return field if field is not None else fallback


def profile_to_documents(profile: dict[str, Any]) -> list[dict[str, Any]]:
    hospital = profile.get("hospital_profile", {})
    capacity = profile.get("capacity", {})
    nurses = profile.get("nurses", {})
    equipment = profile.get("equipment", [])
    doctors = profile.get("doctors", [])

    overview = "\n".join([
        f"Hospital name: {hospital.get('name', 'Unknown')}",
        f"Address: {hospital.get('address', '')}",
        f"Hospital type: {hospital.get('hospital_type', 'General')}",
        f"Licensed beds: {_field_value(capacity.get('total_beds'))}",
        f"ICU beds: {_field_value(capacity.get('icu_beds'))}",
        f"Current occupancy: {_field_value(capacity.get('occupancy'))}%",
        f"Emergency services: {_field_value(capacity.get('emergency_services'))}",
        f"Trauma level: {_field_value(capacity.get('trauma_level'))}",
        f"Physicians on file: {len(doctors)}",
        f"ER nurses: {nurses.get('er_nurses', {}).get('count', 0)}",
        f"ICU nurses: {nurses.get('icu_nurses', {}).get('count', 0)}",
        f"Trauma nurses: {nurses.get('trauma_nurses', {}).get('count', 0)}",
        f"General ward nurses: {nurses.get('general_ward_nurses', {}).get('count', 0)}",
    ])

    equipment_lines = [f"{item.get('name')}: {item.get('count')} units ({item.get('data_source_type', 'estimated')})" for item in equipment]
    equipment_doc = "Hospital equipment inventory:\n" + "\n".join(equipment_lines)

    specialty_counts: dict[str, int] = {}
    for doctor in doctors[:20]:
        specialty = doctor.get("specialty", "Unknown")
        specialty_counts[specialty] = specialty_counts.get(specialty, 0) + 1
    staffing_doc = "Physician specialty distribution:\n" + "\n".join(
        f"{specialty}: {count}" for specialty, count in specialty_counts.items()
    )

    return [
        {"doc_id": "hospital-overview", "text": overview, "metadata": {"source": "hospital_profile", "data_source_type": "real"}},
        {"doc_id": "equipment-inventory", "text": equipment_doc, "metadata": {"source": "equipment_inventory", "data_source_type": "real"}},
        {"doc_id": "physician-staffing", "text": staffing_doc, "metadata": {"source": "npi_physician_registry", "data_source_type": "real"}},
    ]


def digest_to_documents(digest: dict[str, Any]) -> list[dict[str, Any]]:
    summary = digest.get("summary", {})
    learning = digest.get("two_month_learning_summary", {})
    patient_flow = digest.get("patient_flow", {})
    hospital_log = digest.get("hospital_log", [])
    docs: list[dict[str, Any]] = []

    summary_text = "\n".join([
        "Two-month hospital digest summary:",
        f"Total incidents: {summary.get('total_incidents', 0)}",
        f"Total patients: {summary.get('total_patients', 0)}",
        f"Critical patients: {summary.get('critical_patients', 0)}",
        f"Average ER wait: {summary.get('average_er_wait_time_minutes', 0)} minutes",
        f"Average diagnosis delay: {summary.get('average_diagnosis_delay_minutes', 0)} minutes",
        f"Most common incident types: {', '.join(summary.get('most_common_incident_types', []))}",
        f"Most common resource gaps: {', '.join(summary.get('most_common_resource_gaps', []))}",
        f"Recommended hires: {', '.join(learning.get('recommended_hires', []))}",
        f"Recommended training: {', '.join(learning.get('recommended_training', []))}",
    ])
    docs.append({
        "doc_id": "digest-summary",
        "text": summary_text,
        "metadata": {"source": "two_month_digest", "data_source_type": "simulated"},
    })

    if patient_flow:
        flow_text = "\n".join([
            "Two-month patient flow:",
            f"ED arrivals: {patient_flow.get('ed_arrivals_total', 0)}",
            f"Admissions: {patient_flow.get('admissions_total', 0)}",
            f"Discharges: {patient_flow.get('discharges_total', 0)}",
            f"ICU transfers: {patient_flow.get('icu_transfers', 0)}",
            f"Peak occupancy: {patient_flow.get('peak_occupancy_pct', 0)}%",
            f"Avg ED wait: {patient_flow.get('average_ed_wait_minutes', 0)} min",
            f"Bottleneck departments: {', '.join(patient_flow.get('bottleneck_departments', []))}",
        ])
        docs.append({
            "doc_id": "patient-flow",
            "text": flow_text,
            "metadata": {"source": "two_month_digest_patient_flow", "data_source_type": "simulated"},
        })

    if hospital_log:
        log_text = "Hospital operational log (60 days):\n" + "\n".join(
            f"{entry.get('timestamp', '')} [{entry.get('category')}] {entry.get('department')}: {entry.get('event')}"
            for entry in hospital_log[:12]
        )
        docs.append({
            "doc_id": "hospital-log",
            "text": log_text,
            "metadata": {"source": "two_month_digest_hospital_log", "data_source_type": "simulated"},
        })

    for incident in digest.get("incident_reports", digest.get("incidents", []))[:8]:
        incoming = incident.get("incoming_patients", {})
        outcomes = incident.get("outcomes", {})
        bottlenecks = incident.get("bottlenecks", [])
        lessons = incident.get("lessons_learned", [])
        incident_text = "\n".join([
            f"Incident type: {incident.get('incident_type', 'unknown')}",
            f"Date: {incident.get('date', '')}",
            f"Patients: {incoming.get('total', 0)} total ({incoming.get('critical', 0)} critical)",
            f"Deaths: {outcomes.get('deaths', 0)}",
            f"Bottlenecks: {'; '.join(b.get('type', '') + ' - ' + b.get('description', '') for b in bottlenecks[:3])}",
            f"Lessons learned: {'; '.join(lessons[:3])}",
            f"Recommended improvements: {'; '.join(incident.get('recommended_improvements', [])[:3])}",
        ])
        docs.append({
            "doc_id": f"incident-{incident.get('incident_id', 'unknown')}",
            "text": incident_text,
            "metadata": {"source": "incident_digest", "data_source_type": "simulated"},
        })

    return docs


def memory_to_documents(memory: dict[str, Any]) -> list[dict[str, Any]]:
    weaknesses = memory.get("known_weaknesses", [])
    weakness_text = "Hospital memory — recurring system improvement areas:\n" + "\n".join(
        f"- {w.get('weakness', '').replace('_', ' ')} (observed {w.get('times_observed', 1)}x, severity {w.get('severity', 'medium')})"
        for w in weaknesses[-8:]
    )

    notes = memory.get("ai_model_learning_notes", [])
    notes_text = "AI learning notes from prior improvement cycles:\n" + "\n".join(
        f"- {n.get('observation', '')}: {n.get('new_recommendation_logic', '')}" for n in notes[-5:]
    )

    return [
        {"doc_id": "hospital-memory-weaknesses", "text": weakness_text, "metadata": {"source": "hospital_memory", "data_source_type": "simulated"}},
        {"doc_id": "hospital-memory-learning", "text": notes_text, "metadata": {"source": "hospital_memory", "data_source_type": "simulated"}},
    ]


def build_rag_documents(
    profile: dict[str, Any],
    digest: dict[str, Any] | None = None,
    memory: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    documents = profile_to_documents(profile)
    if digest:
        documents.extend(digest_to_documents(digest))
    if memory:
        documents.extend(memory_to_documents(memory))
    return documents
