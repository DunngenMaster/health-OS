import json
import os
from typing import Any

from google import genai


class GeminiAgentError(RuntimeError):
    """Raised when a Gemini agent is required but unavailable or fails."""


async def run_gemini_master_recommendation_agent(context: dict[str, Any]) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiAgentError("GEMINI_API_KEY is required for Hospital OS recommendations")

    try:
        client = genai.Client(api_key=api_key)
        prompt = (
            "You are the Hospital OS master recommendation agent. Return ONLY valid JSON with keys: "
            "immediate_actions[], hiring_recommendations[], training_recommendations[], "
            "equipment_recommendations[], process_recommendations[], 30_day_plan[], 60_day_plan[], "
            "90_day_plan[], readiness_score (int), risk_score (int), confidence (low|medium|high). "
            "Plans must be specific to this hospital's weaknesses, two-month digest, patient flow, and memory. "
            "Never claim real-time availability. Never blame individual clinicians. "
            "Focus on system-level improvements. Label reasoning in each plan item briefly. "
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
        parsed["source"] = "Gemini AI master recommendation agent"
        parsed["gemini_powered"] = True
        return {"status": "completed", "hospital_ai_recommendation": parsed}
    except GeminiAgentError:
        raise
    except Exception as exc:
        raise GeminiAgentError(f"Gemini master recommendation agent failed: {exc}") from exc
