import json
import os
from typing import Any

from google import genai

from app.services.hospital_os.gemini_master_agent import GeminiAgentError


async def run_recommendation_agent(
    hospital_profile: dict[str, Any],
    capacity: dict[str, Any],
    doctors: list[dict[str, Any]],
    nurses: dict[str, Any],
    equipment: list[dict[str, Any]],
    patients_assigned: int | None = None,
    critical_assigned: int | None = None,
    non_critical_assigned: int | None = None,
    eta_minutes: int | None = None,
    impact_zone: str | None = None,
) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiAgentError("GEMINI_API_KEY is required for hospital routing recommendations")

    context = {
        "hospital_profile": hospital_profile,
        "capacity": capacity,
        "doctors_count": len(doctors),
        "doctors_sample": doctors[:5],
        "nurses": nurses,
        "equipment": equipment,
        "patients_assigned": patients_assigned,
        "critical_assigned": critical_assigned,
        "non_critical_assigned": non_critical_assigned,
        "eta_minutes": eta_minutes,
        "impact_zone": impact_zone,
    }

    try:
        client = genai.Client(api_key=api_key)
        prompt = (
            "Analyze this hospital intelligence JSON and return ONLY valid JSON with keys: "
            "can_accept {critical_patients, moderate_patients, minor_patients}, resource_gaps[], "
            "routing_advice, staffing_recommendations[], equipment_recommendations[]. "
            "Never claim real-time bed or staff availability. Base estimates on provided data only. "
            f"Context: {json.dumps(context)}"
        )
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = getattr(response, "text", None) or ""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        parsed = json.loads(cleaned)
        parsed["data_source_type"] = "estimated"
        parsed["source"] = "Gemini AI analysis of public + modeled data"
        return {"status": "completed", "ai_recommendation": parsed}
    except GeminiAgentError:
        raise
    except Exception as exc:
        raise GeminiAgentError(f"Hospital routing recommendation agent failed: {exc}") from exc
