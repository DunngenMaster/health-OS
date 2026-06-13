from collections import Counter
from typing import Any

from app.services.hospital_os.storage import utc_now
from app.services.rag.chroma_rag import collection_chunk_count, retrieve_context


def _field_value(field: Any, fallback: Any = None) -> Any:
    if isinstance(field, dict) and "value" in field:
        return field.get("value", fallback)
    return field if field is not None else fallback


def run_hospital_data_agent(profile: dict[str, Any], cms_data: dict[str, Any] | None = None) -> dict[str, Any]:
    hospital = profile.get("hospital_profile", {})
    capacity = profile.get("capacity", {})
    sources = list(hospital.get("sources", []))
    if cms_data and cms_data.get("source") and cms_data["source"] not in sources:
        sources.append(cms_data["source"])
    return {
        "status": "completed",
        "hospital_identity_report": {
            "hospital_id": hospital.get("hospital_id"),
            "name": hospital.get("name"),
            "address": hospital.get("address"),
            "phone": hospital.get("phone"),
            "website": hospital.get("website"),
            "coordinates": hospital.get("coordinates"),
            "hospital_type": cms_data.get("hospital_type") if cms_data else hospital.get("hospital_type", "general"),
            "emergency_department": hospital.get("emergency_department"),
            "trauma_level": _field_value(capacity.get("trauma_level")),
            "total_beds": cms_data.get("bed_count") if cms_data else _field_value(capacity.get("total_beds")),
            "icu_beds": _field_value(capacity.get("icu_beds")),
            "cms_facility_id": cms_data.get("facility_id") if cms_data else None,
            "cms_emergency_services": cms_data.get("emergency_services") if cms_data else None,
            "data_confidence": "high" if cms_data else hospital.get("data_confidence", "low"),
            "sources": sources,
            "data_source_type": "real" if cms_data else "estimated",
        },
    }


def run_clinical_staffing_agent(profile: dict[str, Any], digest: dict[str, Any]) -> dict[str, Any]:
    doctors = profile.get("doctors", [])
    nurses = profile.get("nurses", {})
    specialties = Counter(doctor.get("specialty", "Unknown") for doctor in doctors)
    learning = digest.get("two_month_learning_summary", {})

    gaps = []
    if specialties.get("Emergency Medicine", 0) < 4:
        gaps.append({
            "need": "2 emergency physicians for high-risk hours",
            "urgency": "high",
            "reason": "Emergency medicine coverage below modeled surge threshold",
            "data_source_type": "estimated",
            "confidence": "medium",
        })
    if nurses.get("icu_nurses", {}).get("count", 0) < 10:
        gaps.append({
            "need": "4 ICU nurses",
            "urgency": "critical",
            "reason": "ICU nurse count below repeated incident surge demand",
            "data_source_type": "simulated",
            "confidence": "medium",
        })
    if specialties.get("Trauma Surgery", 0) < 1:
        gaps.append({
            "need": "1 trauma surgeon on backup call",
            "urgency": "high",
            "reason": "No trauma surgery specialty detected in public physician roster",
            "data_source_type": "estimated",
            "confidence": "low",
        })

    patient_flow = digest.get("patient_flow", {})
    hospital_log = digest.get("hospital_log", [])
    learning = digest.get("two_month_learning_summary", {})

    for hire in learning.get("recommended_hires", [])[:3]:
        gaps.append({
            "need": hire,
            "urgency": "medium",
            "reason": "Derived from two-month digest staffing pressure and patient flow",
            "data_source_type": "simulated",
            "confidence": "medium",
        })

    if patient_flow.get("bottleneck_departments"):
        gaps.append({
            "need": f"Throughput relief for {', '.join(patient_flow['bottleneck_departments'][:2])}",
            "urgency": "high",
            "reason": f"Patient flow bottleneck — avg ED wait {patient_flow.get('average_ed_wait_minutes', 0)} min",
            "data_source_type": "simulated",
            "confidence": "medium",
        })

    return {
        "status": "completed",
        "clinical_staffing_report": {
            "specialty_breakdown": dict(specialties),
            "nurse_counts": nurses,
            "staffing_gaps": gaps,
            "shift_coverage_recommendations": [
                "Add evening ER nurse overlap during weekend surge windows",
                "Pre-alert ICU float pool when regional incident score exceeds threshold",
            ],
            "note": "No on-duty schedule data available; recommendations are system-level only.",
        },
    }


def run_doctor_training_agent(profile: dict[str, Any], digest: dict[str, Any], rag_hits: list[dict[str, Any]]) -> dict[str, Any]:
    learning = digest.get("two_month_learning_summary", {})
    patient_flow = digest.get("patient_flow", {})
    recommendations = []

    for training_name in learning.get("recommended_training", [])[:4]:
        department = "Emergency Medicine" if "triage" in training_name.lower() or "casualty" in training_name.lower() else "ICU"
        if "imaging" in training_name.lower():
            department = "Imaging"
        elif "disaster" in training_name.lower() or "trauma" in training_name.lower():
            department = "Trauma"
        recommendations.append({
            "department": department,
            "training": training_name,
            "format": "Workshop or certification",
            "urgency": "high" if patient_flow.get("average_ed_wait_minutes", 0) > 60 else "medium",
            "reason": "Recommended from two-month digest patient flow and incident patterns",
            "data_source_type": "simulated",
            "confidence": "medium",
            "evidence": [hit.get("content", "")[:120] for hit in rag_hits[:2]],
        })

    return {
        "status": "completed",
        "doctor_training_report": {
            "recommendations": recommendations,
            "guideline_updates": [
                "Review latest cardiac arrest response protocol",
                "Update trauma activation checklist for multi-patient arrivals",
            ],
            "note": "Training recommendations target departments, not individual clinicians.",
        },
    }


def run_equipment_intelligence_agent(profile: dict[str, Any], digest: dict[str, Any]) -> dict[str, Any]:
    equipment = profile.get("equipment", [])
    upgrades = []
    for item in equipment:
        if item.get("count", 0) <= 2:
            upgrades.append({
                "equipment_name": item.get("name"),
                "action": "replace_or_add_units",
                "current_count": item.get("count", 0),
                "recommended_count": item.get("count", 0) + 2,
                "urgency": "high" if item.get("name") == "Ventilator" else "medium",
                "expected_impact": "Reduce diagnosis and treatment delay during surge",
                "data_source_type": item.get("data_source_type", "estimated"),
                "confidence": "medium",
                "reason": "Equipment count below modeled surge demand",
            })

    for upgrade in digest.get("two_month_learning_summary", {}).get("recommended_equipment_upgrades", []):
        upgrades.append({
            "equipment_name": upgrade,
            "action": "consider_new_equipment",
            "urgency": "medium",
            "expected_impact": "Improve emergency throughput based on incident review",
            "data_source_type": "simulated",
            "confidence": "medium",
            "reason": "Incident digest equipment bottleneck pattern",
        })

    return {
        "status": "completed",
        "equipment_intelligence_report": {
            "current_inventory": equipment,
            "upgrade_recommendations": upgrades,
            "replacement_candidates": [item for item in upgrades if item.get("action") == "replace_or_add_units"],
        },
    }


def run_incident_review_agent(digest: dict[str, Any]) -> dict[str, Any]:
    reviews = []
    for incident in digest.get("incident_reports", digest.get("incidents", [])):
        reviews.append({
            "incident_id": incident.get("incident_id"),
            "date": incident.get("date"),
            "incident_type": incident.get("incident_type"),
            "patients": incident.get("incoming_patients"),
            "deaths": incident.get("outcomes", {}).get("deaths", 0),
            "system_analysis": "System-level strain contributed to throughput delays; no individual clinician attribution.",
            "preventable_cases": [
                detail for detail in incident.get("outcomes", {}).get("death_details", [])
                if detail.get("could_potentially_be_prevented")
            ],
            "bottlenecks": incident.get("bottlenecks", []),
            "lessons_learned": incident.get("lessons_learned", []),
            "recommended_improvements": incident.get("recommended_improvements", []),
            "data_source_type": incident.get("data_source_type", "simulated"),
        })

    patient_flow = digest.get("patient_flow", {})
    hospital_log = digest.get("hospital_log", [])

    return {
        "status": "completed",
        "incident_review_report": {
            "reviews": reviews,
            "summary": digest.get("summary", {}),
            "patient_flow_summary": patient_flow,
            "hospital_log_highlights": hospital_log[:8],
            "learning_summary": digest.get("two_month_learning_summary", {}),
            "note": "Review covers incident reports, patient flow, and hospital log from two-month digest.",
        },
    }


def run_clinical_evidence_agent(hospital_id: str) -> dict[str, Any]:
    queries = [
        "staffing shortages occurred in the last two months",
        "equipment caused diagnosis delays",
        "training should trauma doctors complete",
        "equipment upgrades reduce emergency response delay",
        "ICU bed capacity surge bottlenecks",
    ]
    findings = []
    for query in queries:
        hits = retrieve_context(hospital_id, query, top_k=3)
        top = hits[0] if hits else None
        findings.append({
            "query": query,
            "retrieved_chunks": len(hits),
            "summary": top.get("content", "No direct evidence found.")[:280] if top else "No direct evidence found.",
            "confidence": "high" if top and top.get("score", 0) >= 0.5 else "medium" if top else "low",
            "data_source_type": top.get("metadata", {}).get("data_source_type", "unavailable") if top else "unavailable",
            "top_score": top.get("score") if top else None,
            "chunk_id": top.get("chunk_id") if top else None,
        })


    return {
        "status": "completed",
        "clinical_evidence_report": {
            "findings": findings,
            "knowledge_updates": [
                "Maintain early ICU bed clearing during regional incident alerts",
                "Use portable ultrasound to reduce trauma triage delay",
            ],
            "sources_indexed": collection_chunk_count(hospital_id),
            "retrieval_engine": "chromadb",
        },
    }


def run_hospital_memory_agent(
    profile: dict[str, Any],
    digest: dict[str, Any],
    readiness_score: int,
    risk_score: int,
    existing_memory: dict[str, Any] | None,
) -> dict[str, Any]:
    hospital = profile.get("hospital_profile", {})
    hospital_id = hospital.get("hospital_id", "")
    memory = existing_memory or {
        "hospital_id": hospital_id,
        "hospital_name": hospital.get("name", ""),
        "last_updated": utc_now(),
        "readiness_history": [],
        "known_weaknesses": [],
        "successful_improvements": [],
        "staffing_memory": {"recurring_shortages": [], "recommended_hires_history": [], "departments_under_pressure": []},
        "training_memory": {"recommended_trainings": [], "completed_trainings": [], "training_gaps": []},
        "equipment_memory": {"outdated_equipment": [], "equipment_causing_delays": [], "recommended_purchases": [], "completed_upgrades": []},
        "incident_learning_memory": {
            "common_incident_types": [],
            "common_death_contributing_factors": [],
            "preventable_death_patterns": [],
            "routing_failures": [],
            "triage_failures": [],
        },
        "ai_model_learning_notes": [],
    }

    memory["readiness_history"].append({
        "date": utc_now(),
        "readiness_score": readiness_score,
        "risk_score": risk_score,
        "major_reason": "Phase 3 Hospital OS analysis completed",
    })
    memory["readiness_history"] = memory["readiness_history"][-12:]

    for gap in digest.get("summary", {}).get("most_common_resource_gaps", []):
        memory["known_weaknesses"].append({
            "weakness": gap,
            "category": "capacity",
            "first_detected": utc_now(),
            "times_observed": 1,
            "severity": "high",
            "status": "open",
        })

    memory["staffing_memory"]["recurring_shortages"] = digest.get("two_month_learning_summary", {}).get("recommended_hires", [])
    memory["training_memory"]["recommended_trainings"] = digest.get("two_month_learning_summary", {}).get("recommended_training", [])
    memory["equipment_memory"]["recommended_purchases"] = digest.get("two_month_learning_summary", {}).get("recommended_equipment_upgrades", [])
    memory["incident_learning_memory"]["common_incident_types"] = digest.get("summary", {}).get("most_common_incident_types", [])
    memory["ai_model_learning_notes"].append({
        "date": utc_now(),
        "observation": "Two-month digest patient flow and hospital log reviewed for recurring bottlenecks",
        "old_behavior": "Balanced readiness weighting",
        "new_recommendation_logic": "Increase weight for ED wait time and ICU occupancy from patient flow",
        "confidence": "medium",
    })
    memory["last_updated"] = utc_now()
    return {"status": "completed", "hospital_memory": memory}


def run_master_recommendation_agent(
    profile: dict[str, Any],
    staffing: dict[str, Any],
    training: dict[str, Any],
    equipment: dict[str, Any],
    incident_review: dict[str, Any],
    memory: dict[str, Any],
    readiness_score: int,
    risk_score: int,
) -> dict[str, Any]:
    hiring = [gap.get("need") for gap in staffing.get("staffing_gaps", [])]
    training_recs = [item.get("training") for item in training.get("recommendations", [])]
    equipment_recs = [item.get("equipment_name") for item in equipment.get("upgrade_recommendations", [])]
    process_recs = incident_review.get("learning_summary", {}).get("recommended_process_changes", [])

    return {
        "status": "completed",
        "hospital_ai_recommendation": {
            "readiness_score": readiness_score,
            "risk_score": risk_score,
            "immediate_actions": [
                "Activate surge staffing checklist",
                "Verify ventilator reserve and imaging turnaround",
                "Brief trauma and ER leads on current readiness status",
            ],
            "hiring_recommendations": hiring,
            "training_recommendations": training_recs,
            "equipment_recommendations": equipment_recs,
            "process_recommendations": process_recs,
            "30_day_plan": [
                "Hire priority ER/ICU nurses",
                "Run mass casualty triage drill",
                "Add portable ultrasound to trauma bay",
            ],
            "60_day_plan": [
                "Complete disaster medicine training for emergency physicians",
                "Evaluate CT/MRI workflow upgrades",
                "Review ICU surge playbook with department leads",
            ],
            "90_day_plan": [
                "Track readiness score trend in hospital memory",
                "Close top 3 recurring weaknesses from incident digest",
                "Re-run Hospital OS intelligence after improvements",
            ],
            "confidence": "medium",
            "data_source_type": "estimated",
        },
    }
