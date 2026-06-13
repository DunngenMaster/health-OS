import json
import os
from pathlib import Path

from dotenv import load_dotenv
from google import genai

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


DEFAULT_HOSPITALS = []  # unused — scenario routing requires Gemini


def _scenario_summary(scenario):
    summary = scenario.get("summary") if isinstance(scenario, dict) else scenario.summary
    if hasattr(summary, "get"):
        return summary
    return {
        "injured": getattr(summary, "injured", 0),
        "critical": getattr(summary, "critical", 0),
    }


def _split_patient_capacity(total: int, critical_total: int, non_critical_total: int) -> tuple[int, int]:
    if total <= 0:
        return 0, 0
    patient_total = max(1, critical_total + non_critical_total)
    critical = max(0, int(round(total * (critical_total / patient_total))))
    non_critical = max(0, total - critical)
    if critical == 0 and critical_total > 0 and total > 0:
        critical = 1
        non_critical = max(0, total - critical)
    return critical, non_critical


def _apply_capacity_split(hospitals: list[dict], scenario) -> list[dict]:
    summary = _scenario_summary(scenario)
    critical_total = int(summary.get("critical", 0) or 0)
    non_critical_total = int(summary.get("injured", 0) or 0)

    for item in hospitals:
        if item.get("critical_handled") is not None and item.get("non_critical_handled") is not None:
            item["critical_handled"] = max(0, int(item.get("critical_handled", 0) or 0))
            item["non_critical_handled"] = max(0, int(item.get("non_critical_handled", 0) or 0))
            item["patients_handled"] = item["critical_handled"] + item["non_critical_handled"]
            continue

        total = max(1, int(item.get("patients_handled", 0) or 0))
        critical, non_critical = _split_patient_capacity(total, critical_total, non_critical_total)
        item["critical_handled"] = critical
        item["non_critical_handled"] = non_critical
        item["patients_handled"] = critical + non_critical

    return hospitals


def _normalize_hospital_capacity(hospitals, scenario):
    summary = _scenario_summary(scenario)
    total_patients = int(summary.get("injured", 0) or 0) + int(summary.get("critical", 0) or 0)
    normalized = [dict(item) for item in hospitals]
    normalized = _apply_capacity_split(normalized, scenario)

    current_total = sum(int(item.get("patients_handled", 0) or 0) for item in normalized)
    if total_patients <= 0 or current_total <= 0:
        return normalized, total_patients, current_total

    scale = total_patients / current_total
    for item in normalized:
        scaled_total = max(1, int(round((item.get("patients_handled", 0) or 0) * scale)))
        critical, non_critical = _split_patient_capacity(
            scaled_total,
            int(summary.get("critical", 0) or 0),
            int(summary.get("injured", 0) or 0),
        )
        item["critical_handled"] = critical
        item["non_critical_handled"] = non_critical
        item["patients_handled"] = critical + non_critical

    adjusted_total = sum(int(item.get("patients_handled", 0) or 0) for item in normalized)
    diff = total_patients - adjusted_total
    if diff != 0 and normalized:
        if diff > 0:
            normalized[-1]["non_critical_handled"] = max(0, normalized[-1]["non_critical_handled"] + diff)
        else:
            reduce_by = abs(diff)
            if normalized[-1]["non_critical_handled"] >= reduce_by:
                normalized[-1]["non_critical_handled"] -= reduce_by
            else:
                normalized[-1]["critical_handled"] = max(0, normalized[-1]["critical_handled"] - reduce_by)
        normalized[-1]["patients_handled"] = (
            normalized[-1]["critical_handled"] + normalized[-1]["non_critical_handled"]
        )

    return normalized, total_patients, sum(int(item.get("patients_handled", 0) or 0) for item in normalized)


def _scenario_context(scenario):
    if hasattr(scenario, "model_dump"):
        return scenario.model_dump()
    if isinstance(scenario, dict):
        return scenario
    return {
        "id": scenario.id,
        "name": scenario.name,
        "type": scenario.type,
        "location": scenario.location,
        "summary": scenario.summary,
        "impact_points": getattr(scenario, "impact_points", None),
    }


def _impact_points_from_scenario(scenario):
    data = _scenario_context(scenario)
    impact_points = data.get("impact_points") or []
    if impact_points:
        return impact_points

    location = data.get("location")
    if not location:
        return []

    summary = data.get("summary") or {}
    return [{
        "id": "primary-impact",
        "name": location.get("name", "Primary impact zone"),
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "radius_km": 1.5,
        "summary": {
            "injured": summary.get("injured", 0),
            "critical": summary.get("critical", 0),
        },
    }]


async def get_hospital_recommendations(scenario):
    data = _scenario_context(scenario)
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required for scenario hospital recommendations")

    try:
        client = genai.Client(api_key=api_key)
        prompt = (
            "Return only valid JSON with exactly 5 hospitals for this emergency scenario. "
            f"Scenario type: {data.get('type')}. Injured (non-critical): {data.get('summary', {}).get('injured', 0)}. "
            f"Critical: {data.get('summary', {}).get('critical', 0)}. "
            f"Location: {data.get('location', {}).get('name', '')}. "
            "Each object must have hospital_name, latitude, longitude, patients_handled, "
            "critical_handled, non_critical_handled, open_now. "
            "critical_handled + non_critical_handled must equal patients_handled. "
            "Distribute critical and non-critical capacity realistically per hospital size. "
            "Return a JSON object like {\"hospitals\": [{...}, ...]}. "
            "Do not include any markdown fences or explanatory text."
        )
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)

        text = getattr(response, "text", None)
        if not text:
            candidates = getattr(response, "candidates", None) or []
            for candidate in candidates:
                content = getattr(candidate, "content", None)
                parts = getattr(content, "parts", None) or []
                for part in parts:
                    part_text = getattr(part, "text", None)
                    if part_text:
                        text = part_text
                        break
                if text:
                    break

        if not text:
            raise RuntimeError("Gemini returned empty hospital routing response")

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict) or not isinstance(parsed.get("hospitals"), list):
            raise RuntimeError("Gemini hospital routing response missing hospitals array")

        hospitals, total_patients, total_capacity = _normalize_hospital_capacity(parsed["hospitals"][:5], scenario)
        return {
            "hospitals": hospitals,
            "total_patients": total_patients,
            "total_capacity": total_capacity,
            "coverage_status": "covers all patients" if total_capacity >= total_patients else "needs more capacity",
        }
    except RuntimeError:
        raise
    except Exception as exc:
        raise RuntimeError(f"Gemini hospital routing failed: {exc}") from exc


async def analyze_scenario_with_impacts(scenario):
    data = _scenario_context(scenario)
    impact_points = _impact_points_from_scenario(scenario)
    impact_analyses = []

    for point in impact_points:
        point_scenario = {
            "id": data.get("id"),
            "name": data.get("name"),
            "type": data.get("type"),
            "location": {
                "name": point["name"],
                "latitude": point["latitude"],
                "longitude": point["longitude"],
            },
            "summary": point["summary"],
        }
        result = await get_hospital_recommendations(point_scenario)
        impact_analyses.append({
            "impact_point_id": point["id"],
            "impact_point_name": point["name"],
            "latitude": point["latitude"],
            "longitude": point["longitude"],
            "radius_km": point.get("radius_km", 2.0),
            **result,
        })

    return {
        "scenario_id": data.get("id"),
        "scenario_name": data.get("name"),
        "scenario_type": data.get("type"),
        "summary": data.get("summary"),
        "impact_analyses": impact_analyses,
    }
