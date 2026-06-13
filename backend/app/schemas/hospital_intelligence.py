from typing import Any, Literal

from pydantic import BaseModel, Field


DataSourceType = Literal["real", "estimated", "simulated", "unavailable"]


class HospitalIntelligenceRequest(BaseModel):
    name: str
    latitude: float
    longitude: float
    address: str | None = None
    place_id: str | None = None
    mapbox_id: str | None = None
    patients_assigned: int | None = None
    critical_assigned: int | None = None
    non_critical_assigned: int | None = None
    eta_minutes: int | None = None
    distance_km: float | None = None
    congestion: str | None = None
    impact_zone: str | None = None


class FieldValue(BaseModel):
    value: Any | None = None
    data_source_type: DataSourceType = "unavailable"
    source: str = ""


class Coordinates(BaseModel):
    lat: float
    lng: float


class HospitalProfile(BaseModel):
    hospital_id: str
    name: str
    address: str = ""
    coordinates: Coordinates
    phone: str = ""
    website: str = ""
    hospital_type: str = ""
    emergency_department: FieldValue = Field(default_factory=FieldValue)
    data_confidence: Literal["high", "medium", "low"] = "low"
    sources: list[str] = Field(default_factory=list)


class NurseCount(BaseModel):
    count: int = 0
    data_source_type: DataSourceType = "simulated"
    source: str = ""


class DoctorRecord(BaseModel):
    name: str
    specialty: str = ""
    organization: str = ""
    npi: str = ""
    data_source_type: DataSourceType = "real"
    source: str = ""


class EquipmentRecord(BaseModel):
    name: str
    count: int = 0
    data_source_type: DataSourceType = "estimated"
    source: str = ""


class CanAccept(BaseModel):
    critical_patients: int = 0
    moderate_patients: int = 0
    minor_patients: int = 0


class AiRecommendation(BaseModel):
    can_accept: CanAccept = Field(default_factory=CanAccept)
    resource_gaps: list[str] = Field(default_factory=list)
    routing_advice: str = ""
    staffing_recommendations: list[str] = Field(default_factory=list)
    equipment_recommendations: list[str] = Field(default_factory=list)


class ScenarioAssignmentSection(BaseModel):
    critical_patients: FieldValue = Field(default_factory=FieldValue)
    non_critical_patients: FieldValue = Field(default_factory=FieldValue)
    total_patients: FieldValue = Field(default_factory=FieldValue)
    eta_minutes: FieldValue = Field(default_factory=FieldValue)
    distance_km: FieldValue = Field(default_factory=FieldValue)
    congestion: FieldValue = Field(default_factory=FieldValue)
    impact_zone: FieldValue = Field(default_factory=FieldValue)


class CapacitySection(BaseModel):
    scenario_assignment: ScenarioAssignmentSection = Field(default_factory=ScenarioAssignmentSection)
    total_beds: FieldValue = Field(default_factory=FieldValue)
    icu_beds: FieldValue = Field(default_factory=FieldValue)
    emergency_services: FieldValue = Field(default_factory=FieldValue)
    trauma_level: FieldValue = Field(default_factory=FieldValue)
    occupancy: FieldValue = Field(default_factory=FieldValue)


class NursesSection(BaseModel):
    er_nurses: NurseCount = Field(default_factory=NurseCount)
    icu_nurses: NurseCount = Field(default_factory=NurseCount)
    trauma_nurses: NurseCount = Field(default_factory=NurseCount)
    general_ward_nurses: NurseCount = Field(default_factory=NurseCount)


class HospitalIntelligenceResponse(BaseModel):
    hospital_profile: HospitalProfile
    capacity: CapacitySection
    doctors: list[DoctorRecord] = Field(default_factory=list)
    nurses: NursesSection = Field(default_factory=NursesSection)
    equipment: list[EquipmentRecord] = Field(default_factory=list)
    ai_recommendation: AiRecommendation = Field(default_factory=AiRecommendation)
    collected_at: str = ""
    agent_status: dict[str, str] = Field(default_factory=dict)
