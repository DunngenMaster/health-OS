from app.schemas.hospital_intelligence import HospitalIntelligenceRequest
from app.services.agents.orchestrator import run_orchestrator
from app.services.agents.utils import load_hospital_profile


async def collect_hospital_intelligence(payload: HospitalIntelligenceRequest):
    return await run_orchestrator(payload)


def get_hospital_profile(hospital_id: str):
    return load_hospital_profile(hospital_id)
