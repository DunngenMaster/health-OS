from fastapi import APIRouter, HTTPException

from app.schemas.hospital_intelligence import HospitalIntelligenceRequest
from app.schemas.hospital_os import (
    HospitalOsEnhanceRequest,
    HospitalOsRagIndexRequest,
    HospitalOsRagQueryRequest,
    HospitalOsSyncRequest,
    ScenarioAgentRequest,
)
from app.schemas.scenario import ScenarioAnalyzeInput, ScenarioFormRequest, ScenarioRequest
from app.services.gemini_service import analyze_scenario, prepare_scenario_from_form
from app.services.location_agent import LocationAgentError
from app.services.hospital_os.gemini_master_agent import GeminiAgentError
from app.services.hospital_intelligence_service import collect_hospital_intelligence, get_hospital_profile
from app.services.hospital_os_service import (
    enhance_hospital_os_recommendations,
    generate_hospital_os_report,
    get_hospital_os_report,
    index_hospital_rag,
    query_hospital_rag,
    run_clinical_evidence_queries,
    run_scenario_agent_analysis,
    sync_hospital_os_report,
    generate_hospital_digest,
)

router = APIRouter(prefix="/api/v1", tags=["scenario"])


@router.post("/analyze-scenario")
async def analyze_scenario_route(payload: ScenarioAnalyzeInput):
    try:
        if payload.is_form_mode:
            prepared = await prepare_scenario_from_form(
                ScenarioFormRequest(
                    name=payload.name,
                    type=payload.type,
                    location_name=payload.location_name or "",
                    injured=payload.injured or 0,
                    critical=payload.critical or 0,
                    severity=payload.severity or "",
                    id=payload.id,
                )
            )
            scenario = ScenarioRequest.model_validate(prepared)
        else:
            scenario = ScenarioRequest.model_validate(payload.model_dump(exclude_none=True))
        return await analyze_scenario(scenario)
    except LocationAgentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# Form submissions use location_name; full scenarios use summary + location/impact_points.


@router.post("/prepare-scenario")
async def prepare_scenario_route(payload: ScenarioFormRequest):
    """Geocode written location via Gemini and return a map-ready scenario payload."""
    try:
        return await prepare_scenario_from_form(payload)
    except LocationAgentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/hospital-intelligence")
async def hospital_intelligence_route(payload: HospitalIntelligenceRequest):
    result = await collect_hospital_intelligence(payload)
    return result


@router.get("/hospital-intelligence/{hospital_id}")
async def get_hospital_intelligence_route(hospital_id: str):
    result = get_hospital_profile(hospital_id)
    if not result:
        raise HTTPException(status_code=404, detail="Hospital profile not found")
    return result


@router.post("/hospital-os/generate")
async def sync_hospital_os_route(payload: HospitalOsSyncRequest):
    try:
        if payload.master_report:
            return sync_hospital_os_report(payload.hospital_id, payload.profile, payload.master_report)
        return await generate_hospital_os_report(payload.hospital_id, payload.profile)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/hospital-os/{hospital_id}/generate")
async def generate_hospital_os_route(hospital_id: str):
    try:
        return await generate_hospital_os_report(hospital_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get("/hospital-os/{hospital_id}/master-report")
async def get_hospital_os_master_report_route(hospital_id: str):
    result = get_hospital_os_report(hospital_id)
    if not result:
        raise HTTPException(status_code=404, detail="Hospital OS master report not found")
    return result


@router.post("/hospital-os/enhance")
async def enhance_hospital_os_route(payload: HospitalOsEnhanceRequest):
    try:
        return await enhance_hospital_os_recommendations(payload.context)
    except GeminiAgentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/hospital-os/rag-index")
async def hospital_os_rag_index_route(payload: HospitalOsRagIndexRequest):
    try:
        return index_hospital_rag(
            payload.hospital_id,
            payload.profile,
            payload.incident_digest,
            payload.hospital_memory,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/hospital-os/rag-query")
async def hospital_os_rag_query_route(payload: HospitalOsRagQueryRequest):
    try:
        return {
            "hospital_id": payload.hospital_id,
            "query": payload.query,
            "citations": query_hospital_rag(payload.hospital_id, payload.query, payload.top_k),
            "retrieval_engine": "chromadb",
        }
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/hospital-os/{hospital_id}/clinical-evidence")
async def hospital_os_clinical_evidence_route(hospital_id: str):
    try:
        return run_clinical_evidence_queries(hospital_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post("/hospital-os/digest")
async def hospital_os_digest_route(payload: HospitalOsSyncRequest):
    if not payload.profile:
        raise HTTPException(status_code=400, detail="profile is required")
    return generate_hospital_digest(payload.profile)


@router.post("/hospital-os/scenario-agent")
async def hospital_os_scenario_agent_route(payload: ScenarioAgentRequest):
    try:
        return await run_scenario_agent_analysis(
            payload.hospital_id,
            payload.profile,
            payload.incoming.model_dump(),
            payload.specification,
        )
    except GeminiAgentError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

