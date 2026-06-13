import json
import os
import re

from google import genai


class LocationAgentError(RuntimeError):
    """Raised when the Gemini location agent is unavailable or fails."""


def _extract_response_text(response) -> str:
    text = getattr(response, "text", None)
    if text:
        return text

    for candidate in getattr(response, "candidates", None) or []:
        content = getattr(candidate, "content", None)
        for part in getattr(content, "parts", None) or []:
            part_text = getattr(part, "text", None)
            if part_text:
                return part_text
    return ""


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "scenario"


async def resolve_location_coordinates(location_name: str) -> dict[str, float | str]:
    """Use Gemini to resolve a written place name to latitude and longitude."""
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise LocationAgentError("GEMINI_API_KEY is required for scenario location geocoding")

    try:
        client = genai.Client(api_key=api_key)
        prompt = (
            "You are a geocoding agent for emergency scenario mapping. "
            f"Resolve this location to WGS84 coordinates: \"{location_name}\". "
            "Return ONLY valid JSON with keys: latitude (number), longitude (number), "
            "resolved_name (string, canonical place label). "
            "Use accurate real-world coordinates. No markdown or explanation."
        )
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = _extract_response_text(response)
        if not text:
            raise LocationAgentError("Gemini location agent returned an empty response")

        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]

        parsed = json.loads(cleaned)
        latitude = float(parsed.get("latitude"))
        longitude = float(parsed.get("longitude"))
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise LocationAgentError("Gemini returned invalid coordinates")

        resolved_name = str(parsed.get("resolved_name") or location_name).strip()
        return {
            "latitude": latitude,
            "longitude": longitude,
            "resolved_name": resolved_name,
        }
    except LocationAgentError:
        raise
    except Exception as exc:
        raise LocationAgentError(f"Gemini location geocoding failed: {exc}") from exc


def scenario_id_from_name(name: str) -> str:
    return f"scenario-{_slugify(name)}"
