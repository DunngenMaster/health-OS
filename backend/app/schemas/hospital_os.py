from typing import Any

from pydantic import BaseModel, Field


class HospitalOsSyncRequest(BaseModel):
    hospital_id: str
    profile: dict[str, Any] | None = None
    master_report: dict[str, Any] | None = None


class HospitalOsEnhanceRequest(BaseModel):
    hospital_id: str
    context: dict[str, Any] = Field(default_factory=dict)


class HospitalOsRagIndexRequest(BaseModel):
    hospital_id: str
    profile: dict[str, Any]
    incident_digest: dict[str, Any] | None = None
    hospital_memory: dict[str, Any] | None = None


class HospitalOsRagQueryRequest(BaseModel):
    hospital_id: str
    query: str
    top_k: int = 5


class ScenarioAgentIncoming(BaseModel):
    critical: int = 0
    moderate: int = 0
    minor: int = 0


class ScenarioAgentRequest(BaseModel):
    hospital_id: str
    profile: dict[str, Any]
    incoming: ScenarioAgentIncoming
    specification: str = ""
