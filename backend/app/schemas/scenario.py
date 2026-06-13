from typing import Optional

from pydantic import BaseModel, Field, model_validator


class ImpactSummary(BaseModel):
    injured: int
    critical: int


class ImpactPoint(BaseModel):
    id: str
    name: str
    latitude: float
    longitude: float
    radius_km: float = 2.0
    summary: ImpactSummary


class ScenarioSummary(BaseModel):
    injured: int
    critical: int
    severity: str


class ScenarioLocation(BaseModel):
    name: str
    latitude: float
    longitude: float


class ScenarioFormRequest(BaseModel):
    name: str = Field(min_length=1)
    type: str = Field(min_length=1)
    location_name: str = Field(min_length=1)
    injured: int = Field(ge=0)
    critical: int = Field(ge=0)
    severity: str = Field(min_length=1)
    id: str | None = None


class ScenarioAnalyzeInput(BaseModel):
    """Accepts either a map-ready scenario or form fields with a written location."""
    name: str = Field(min_length=1)
    type: str = Field(min_length=1)
    id: str | None = None
    summary: ScenarioSummary | None = None
    location: ScenarioLocation | None = None
    impact_points: list[ImpactPoint] | None = None
    location_name: str | None = None
    injured: int | None = Field(default=None, ge=0)
    critical: int | None = Field(default=None, ge=0)
    severity: str | None = None

    @model_validator(mode='after')
    def validate_input_mode(self):
        if self.location_name:
            if self.injured is None or self.critical is None or not self.severity:
                raise ValueError('Form input requires injured, critical, and severity')
            return self
        if not self.summary:
            raise ValueError('Scenario summary is required')
        if not self.location and not self.impact_points:
            raise ValueError('Scenario must include location or impact_points')
        return self

    @property
    def is_form_mode(self) -> bool:
        return bool(self.location_name)


class ScenarioRequest(BaseModel):
    id: str
    name: str
    type: str
    summary: ScenarioSummary
    location: ScenarioLocation | None = Field(default=None)
    impact_points: list[ImpactPoint] | None = Field(default=None)

    @model_validator(mode='after')
    def validate_locations(self):
        if not self.location and not self.impact_points:
            raise ValueError('Scenario must include location or impact_points')
        return self


class HospitalRecommendation(BaseModel):
    hospital_name: str
    latitude: float
    longitude: float
    patients_handled: int
    critical_handled: int = 0
    non_critical_handled: int = 0
    open_now: bool
