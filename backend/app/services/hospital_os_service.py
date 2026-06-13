from typing import Any

from app.services.hospital_os.gemini_master_agent import run_gemini_master_recommendation_agent
from app.services.hospital_os.orchestrator import run_hospital_os_orchestrator
from app.services.hospital_os.storage import (
    load_hospital_profile,
    load_master_report,
    save_hospital_memory,
    save_hospital_profile,
    save_incident_digest,
    save_master_report,
)
from app.services.hospital_os.incident_digest import generate_two_month_hospital_digest
from app.services.hospital_os.scenario_agent import run_scenario_agent
from app.services.rag.chroma_rag import CHROMA_AVAILABLE, build_rag_index, retrieve_context
from app.services.rag.document_builder import build_rag_documents


async def generate_hospital_os_report(hospital_id: str, profile: dict[str, Any] | None = None) -> dict[str, Any]:
    resolved = profile or load_hospital_profile(hospital_id)
    if not resolved:
        raise ValueError(f"No hospital profile found for {hospital_id}")
    if profile:
        save_hospital_profile(hospital_id, profile)
    return await run_hospital_os_orchestrator(resolved)


def get_hospital_os_report(hospital_id: str) -> dict[str, Any] | None:
    return load_master_report(hospital_id)


def sync_hospital_os_report(hospital_id: str, profile: dict[str, Any] | None, master_report: dict[str, Any] | None) -> dict[str, Any]:
    if profile:
        save_hospital_profile(hospital_id, profile)
    if master_report:
        save_master_report(hospital_id, master_report)
        if master_report.get("incident_digest"):
            save_incident_digest(hospital_id, master_report["incident_digest"])
        if master_report.get("hospital_memory"):
            save_hospital_memory(hospital_id, master_report["hospital_memory"])
        return master_report
    raise ValueError("master_report is required for sync")


async def enhance_hospital_os_recommendations(context: dict[str, Any]) -> dict[str, Any]:
    return await run_gemini_master_recommendation_agent(context)


def index_hospital_rag(
    hospital_id: str,
    profile: dict[str, Any],
    incident_digest: dict[str, Any] | None = None,
    hospital_memory: dict[str, Any] | None = None,
) -> dict[str, Any]:
    documents = build_rag_documents(profile, incident_digest, hospital_memory)
    chunk_count = build_rag_index(hospital_id, documents)
    return {
        "hospital_id": hospital_id,
        "documents_indexed": len(documents),
        "chunks_indexed": chunk_count,
        "retrieval_engine": "chromadb" if CHROMA_AVAILABLE else "unavailable",
        "chromadb_available": CHROMA_AVAILABLE,
    }


def query_hospital_rag(hospital_id: str, query: str, top_k: int = 5) -> list[dict[str, Any]]:
    return retrieve_context(hospital_id, query, top_k)


def run_clinical_evidence_queries(hospital_id: str) -> dict[str, Any]:
    from app.services.hospital_os.agents import run_clinical_evidence_agent

    return run_clinical_evidence_agent(hospital_id)


async def run_scenario_agent_analysis(
    hospital_id: str,
    profile: dict[str, Any],
    incoming: dict[str, Any],
    specification: str = "",
) -> dict[str, Any]:
    return await run_scenario_agent(hospital_id, profile, incoming, specification)


def generate_hospital_digest(profile: dict[str, Any]) -> dict[str, Any]:
    return generate_two_month_hospital_digest(profile)
