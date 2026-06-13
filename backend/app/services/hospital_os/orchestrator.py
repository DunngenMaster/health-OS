from typing import Any

from app.services.hospital_os.agents import (
    run_clinical_staffing_agent,
    run_doctor_training_agent,
    run_equipment_intelligence_agent,
    run_hospital_data_agent,
    run_hospital_memory_agent,
    run_incident_review_agent,
    run_clinical_evidence_agent,
)
from app.services.hospital_os.cms_data_service import fetch_cms_hospital_data
from app.services.hospital_os.gemini_master_agent import run_gemini_master_recommendation_agent
from app.services.hospital_os.incident_digest import generate_operational_context
from app.services.hospital_os.storage import (
    load_hospital_memory,
    save_hospital_memory,
    save_master_report,
    utc_now,
)
from app.services.rag.chroma_rag import build_rag_index, retrieve_context
from app.services.rag.document_builder import build_rag_documents


def _count_source_types(payload: Any, counts: dict[str, int] | None = None) -> dict[str, int]:
    counts = counts or {"real": 0, "estimated": 0, "simulated": 0, "unavailable": 0}
    if isinstance(payload, dict):
        source = payload.get("data_source_type")
        if source in counts:
            counts[source] += 1
        for value in payload.values():
            _count_source_types(value, counts)
    elif isinstance(payload, list):
        for item in payload:
            _count_source_types(item, counts)
    return counts


def _field_value(field: Any, fallback: Any = 0) -> Any:
    if isinstance(field, dict) and "value" in field:
        value = field.get("value", fallback)
        return fallback if value is None else value
    return field if field is not None else fallback


def _compute_readiness(profile: dict[str, Any], digest: dict[str, Any]) -> tuple[int, int]:
    capacity = profile.get("capacity", {})
    nurses = profile.get("nurses", {})
    equipment = profile.get("equipment", [])
    doctors = profile.get("doctors", [])

    score = 55
    if _field_value(capacity.get("total_beds"), 0) >= 100:
        score += 8
    if nurses.get("icu_nurses", {}).get("count", 0) >= 10:
        score += 8
    if len(doctors) >= 8:
        score += 8
    if any(item.get("name") == "Ventilator" and item.get("count", 0) >= 6 for item in equipment):
        score += 6

    deaths = digest.get("summary", {}).get("total_deaths", 0)
    preventable = digest.get("summary", {}).get("preventable_deaths_estimate", 0)
    risk = min(95, 30 + deaths * 8 + preventable * 10 + len(digest.get("summary", {}).get("most_common_resource_gaps", [])) * 4)
    readiness = max(20, min(95, score - deaths * 3))
    return readiness, risk


def _status_from_scores(readiness: int, risk: int) -> dict[str, str]:
    return {
        "capacity_status": "critical" if risk >= 70 else "strained" if risk >= 45 else "stable",
        "staffing_status": "critical_shortage" if readiness < 45 else "shortage" if readiness < 65 else "stable",
        "equipment_status": "critical_gap" if risk >= 65 else "aging" if risk >= 40 else "modern",
        "training_status": "critical_gap" if risk >= 60 else "needs_update" if readiness < 70 else "up_to_date",
    }


def _build_rag_documents(profile: dict[str, Any], digest: dict[str, Any], memory: dict[str, Any] | None) -> list[dict[str, Any]]:
    return build_rag_documents(profile, digest, memory)


async def run_hospital_os_orchestrator(profile: dict[str, Any]) -> dict[str, Any]:
    hospital = profile.get("hospital_profile", {})
    hospital_id = hospital.get("hospital_id", "unknown")

    cms_data = await fetch_cms_hospital_data(hospital.get("name", ""), hospital.get("address", ""))
    if cms_data and cms_data.get("bed_count"):
        capacity = profile.setdefault("capacity", {})
        if not _field_value(capacity.get("total_beds")):
            capacity["total_beds"] = {
                "value": cms_data["bed_count"],
                "data_source_type": "real",
                "source": cms_data.get("source", "CMS Hospital General Information"),
            }
        hospital.setdefault("sources", [])
        if cms_data.get("source") not in hospital["sources"]:
            hospital["sources"].append(cms_data["source"])

    digest = generate_operational_context(profile)

    existing_memory = load_hospital_memory(hospital_id)
    rag_documents = _build_rag_documents(profile, digest, existing_memory)
    chunk_count = build_rag_index(hospital_id, rag_documents)
    rag_hits = retrieve_context(hospital_id, "staffing shortages equipment delays training trauma ICU", top_k=8)

    identity = run_hospital_data_agent(profile, cms_data)
    staffing = run_clinical_staffing_agent(profile, digest)
    training = run_doctor_training_agent(profile, digest, rag_hits)
    equipment = run_equipment_intelligence_agent(profile, digest)
    incident_review = run_incident_review_agent(digest)
    clinical_evidence = run_clinical_evidence_agent(hospital_id)

    readiness_score, risk_score = _compute_readiness(profile, digest)
    memory_result = run_hospital_memory_agent(profile, digest, readiness_score, risk_score, existing_memory)
    memory = memory_result["hospital_memory"]
    save_hospital_memory(hospital_id, memory)

    gemini_context = {
        "hospital_name": hospital.get("name"),
        "readiness_score": readiness_score,
        "risk_score": risk_score,
        "weaknesses": [w.get("weakness") for w in memory.get("known_weaknesses", [])[:5]],
        "hiring": [g.get("need") for g in staffing["clinical_staffing_report"].get("staffing_gaps", [])],
        "training": [t.get("training") for t in training["doctor_training_report"].get("recommendations", [])],
        "equipment": [e.get("equipment_name") for e in equipment["equipment_intelligence_report"].get("upgrade_recommendations", [])],
        "process": incident_review["incident_review_report"].get("learning_summary", {}).get("recommended_process_changes", []),
        "rag_findings": clinical_evidence["clinical_evidence_report"].get("findings", []),
        "incident_summary": digest.get("summary", {}),
        "patient_flow": digest.get("patient_flow", {}),
        "hospital_log": digest.get("hospital_log", [])[:10],
        "cms_data": cms_data,
    }
    gemini_result = await run_gemini_master_recommendation_agent(gemini_context)
    recommendations = gemini_result["hospital_ai_recommendation"]

    statuses = _status_from_scores(readiness_score, risk_score)
    transparency = _count_source_types({
        "profile": profile,
        "digest": digest,
        "memory": memory,
        "staffing": staffing,
        "training": training,
        "equipment": equipment,
    })

    master_report = {
        "generated_at": utc_now(),
        "hospital_profile": profile.get("hospital_profile", {}),
        "capacity": profile.get("capacity", {}),
        "doctors": profile.get("doctors", []),
        "nurses": profile.get("nurses", {}),
        "equipment": profile.get("equipment", []),
        "incident_digest": digest,
        "hospital_memory": memory,
        "agent_reports": {
            "hospital_identity_report": identity["hospital_identity_report"],
            "clinical_staffing_report": staffing["clinical_staffing_report"],
            "doctor_training_report": training["doctor_training_report"],
            "equipment_intelligence_report": equipment["equipment_intelligence_report"],
            "incident_review_report": incident_review["incident_review_report"],
            "clinical_evidence_report": clinical_evidence["clinical_evidence_report"],
            "hospital_ai_recommendation": recommendations,
        },
        "readiness_dashboard": {
            "readiness_score": readiness_score,
            "risk_score": risk_score,
            **statuses,
        },
        "recommendations": recommendations,
        "data_transparency": {
            "real_fields_count": transparency["real"],
            "estimated_fields_count": transparency["estimated"],
            "simulated_fields_count": transparency["simulated"],
            "unavailable_fields_count": transparency["unavailable"],
            "sources": [
                "hospital_profile",
                "operational_context",
                "hospital_memory",
                "chromadb",
                "cms_hospital_general_information",
                "gemini_master_agent",
            ],
        },
    }

    save_master_report(hospital_id, master_report)
    return master_report
