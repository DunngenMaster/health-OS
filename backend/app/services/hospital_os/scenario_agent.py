from __future__ import annotations

import json
import os
import re
from collections import Counter
from typing import Any

from google import genai

from app.services.hospital_os.gemini_master_agent import GeminiAgentError

from app.services.hospital_os.capacity_model import run_capacity_simulation
from app.services.hospital_os.storage import utc_now
from app.services.rag.chroma_rag import CHROMA_AVAILABLE, retrieve_context


SCENARIO_AGENT_PIPELINE = [
    "Specification Parser Agent",
    "Capacity & Surge Model Agent",
    "Staffing & Roster Analysis Agent",
    "Clinical Evidence Agent",
    "Gemini Scenario Synthesis Agent",
]


def _extract_number(text: str, patterns: list[str]) -> int:
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            try:
                return max(0, int(match.group(1)))
            except (TypeError, ValueError):
                continue
    return 0


def parse_scenario_specification(text: str) -> dict[str, Any]:
    lower = text.lower()
    parsed: dict[str, Any] = {
        "burn": _extract_number(lower, [r"(\d+)\s*burn", r"burn[:\s]+(\d+)"]),
        "cardiac_arrest": _extract_number(
            lower,
            [r"(\d+)\s*cardiac\s*arrest", r"(\d+)\s*cardiac", r"cardiac arrest[:\s]+(\d+)"],
        ),
        "doctors_on_leave": _extract_number(
            lower,
            [r"(\d+)\s*doctor[s]?\s*on\s*leave", r"(\d+)\s*physician[s]?\s*away"],
        ),
        "trauma": _extract_number(lower, [r"(\d+)\s*trauma", r"(\d+)\s*multi-trauma"]),
        "infectious": _extract_number(lower, [r"(\d+)\s*infectious", r"(\d+)\s*outbreak"]),
        "minor": _extract_number(lower, [r"(\d+)\s*minor\s*patient", r"(\d+)\s*minor"]),
        "notes": [],
    }

    if re.search(r"\b(one|single|only)\s+patient\b", lower):
        parsed["minor"] = max(parsed.get("minor", 0), 1)
    if re.search(r"fever|minor\s+illness|low\s+acuity|routine\s+case", lower):
        parsed["routine_presentation"] = True

    if parsed["burn"]:
        parsed["notes"].append(f"{parsed['burn']} burn patient(s) — critical/moderate triage")
    if parsed["cardiac_arrest"]:
        parsed["notes"].append(f"{parsed['cardiac_arrest']} cardiac arrest case(s) — needs cardiology + ICU")
    if parsed["doctors_on_leave"]:
        parsed["notes"].append(f"{parsed['doctors_on_leave']} physician(s) on leave — reduces effective coverage")
    if parsed["trauma"]:
        parsed["notes"].append(f"{parsed['trauma']} trauma case(s)")
    if parsed["infectious"]:
        parsed["notes"].append(f"{parsed['infectious']} infectious/isolation case(s)")
    if parsed.get("minor"):
        parsed["notes"].append(f"{parsed['minor']} minor/low-acuity patient(s)")
    if parsed.get("routine_presentation"):
        parsed["notes"].append("Routine/minor presentation — no surge expected")

    return parsed


def _spec_describes_standalone_minor_case(parsed: dict[str, Any]) -> bool:
    surge_signals = (
        parsed.get("burn", 0)
        or parsed.get("cardiac_arrest", 0)
        or parsed.get("trauma", 0)
        or parsed.get("infectious", 0)
        or parsed.get("doctors_on_leave", 0)
    )
    return bool(parsed.get("routine_presentation") or parsed.get("minor")) and not surge_signals


def apply_specification_to_incoming(base: dict[str, int], parsed: dict[str, Any]) -> dict[str, int]:
    if _spec_describes_standalone_minor_case(parsed):
        minor_count = max(1, int(parsed.get("minor") or 1))
        return {"critical": 0, "moderate": 0, "minor": minor_count}

    critical = base.get("critical", 0) + parsed.get("burn", 0) + parsed.get("cardiac_arrest", 0) + parsed.get("trauma", 0)
    moderate = base.get("moderate", 0) + int((parsed.get("burn", 0) or 0) * 0.3)
    minor = base.get("minor", 0) + (parsed.get("infectious", 0) or 0)
    if parsed.get("cardiac_arrest"):
        moderate += int(parsed["cardiac_arrest"] * 0.5)

    return {
        "critical": round(critical),
        "moderate": round(moderate),
        "minor": round(minor),
    }


def _specialty_counts(profile: dict[str, Any]) -> dict[str, int]:
    return Counter(doctor.get("specialty", "Unknown") for doctor in profile.get("doctors", []))


def classify_scenario_tier(context: dict[str, Any]) -> str:
    """routine | elevated | surge | critical — drives proportional recommendations."""
    simulation = context["simulation"]
    incoming = context["effective_incoming"]
    total = simulation["total_incoming"]
    pressure = simulation["pressure_score"]
    critical = incoming.get("critical", 0)
    moderate = incoming.get("moderate", 0)

    if not simulation["can_handle"] or critical >= 5:
        return "critical"
    if pressure >= 55 or total >= 20 or critical >= 2 or moderate >= 10:
        return "surge"
    if pressure >= 20 or total >= 5 or critical >= 1 or moderate >= 3:
        return "elevated"
    return "routine"


def _build_routine_scenario_response(context: dict[str, Any]) -> dict[str, Any]:
    incoming = context["effective_incoming"]
    simulation = context["simulation"]
    hospital_name = context.get("hospital_name", "Hospital")
    minor = incoming.get("minor", 0)
    spec = context.get("specification") or "minor presentation"

    return {
        "executive_summary": (
            f"{hospital_name} can handle this load without surge activation. "
            f"{minor or simulation['total_incoming']} minor patient(s) described ({spec.strip() or 'routine case'}) "
            f"fit comfortably within modeled capacity at {simulation['pressure_score']}% pressure."
        ),
        "routing_summary": simulation["routing_advice"],
        "staffing_actions": [],
        "physician_actions": [],
        "equipment_actions": [],
        "immediate_actions": [
            "Standard ED triage and nursing assessment — no additional staffing required for this load.",
            "Monitor for deterioration; escalate only if acuity changes.",
        ],
        "partner_routing": "No partner routing required for this scenario load.",
        "clinical_evidence": [],
        "confidence": "high",
        "limitations": [
            "Hospital-wide staffing and equipment gaps exist in the profile but are not triggered by this low-acuity scenario.",
            "Historical incident patterns are not applicable to a single minor presentation.",
        ],
        "agent_powered": True,
        "source": "Scenario Agent (routine tier)",
        "scenario_tier": "routine",
    }


def _equipment_count(profile: dict[str, Any], name_pattern: str) -> int:
    for item in profile.get("equipment", []):
        if re.search(name_pattern, str(item.get("name", "")), re.IGNORECASE):
            return int(item.get("count", 0) or 0)
    return 0


def build_operational_context(
    profile: dict[str, Any],
    incoming: dict[str, int],
    specification: str,
) -> dict[str, Any]:
    hospital = profile.get("hospital_profile", {})
    parsed = parse_scenario_specification(specification)
    effective_incoming = apply_specification_to_incoming(incoming, parsed) if specification.strip() else incoming
    simulation = run_capacity_simulation(profile, effective_incoming)
    specialties = _specialty_counts(profile)
    nurses = profile.get("nurses", {})
    doctors = profile.get("doctors", [])

    cardiologists = sum(1 for d in doctors if re.search(r"cardio", d.get("specialty", ""), re.I))
    emergency_mds = specialties.get("Emergency Medicine", 0)
    trauma_mds = sum(
        1 for d in doctors if re.search(r"trauma|surgery", d.get("specialty", ""), re.I)
    )
    icu_nurses = nurses.get("icu_nurses", {}).get("count", 0)
    er_nurses = nurses.get("er_nurses", {}).get("count", 0)
    ventilators = _equipment_count(profile, r"ventilator")
    ultrasound = _equipment_count(profile, r"ultrasound")

    effective_physicians = max(0, len(doctors) - (parsed.get("doctors_on_leave") or 0))
    scenario_tier = classify_scenario_tier({
        "simulation": simulation,
        "effective_incoming": effective_incoming,
    })
    needs_cardio = bool(parsed.get("cardiac_arrest")) or scenario_tier in ("surge", "critical")
    cardio_gap = max(0, 4 - cardiologists) if needs_cardio else 0
    er_nurse_gap = max(0, 12 - er_nurses) if scenario_tier != "routine" else 0
    icu_nurse_gap = max(0, 10 - icu_nurses) if scenario_tier in ("surge", "critical") else 0

    return {
        "hospital_id": hospital.get("hospital_id"),
        "hospital_name": hospital.get("name"),
        "hospital_address": hospital.get("address"),
        "specification": specification.strip(),
        "parsed_specification": parsed,
        "scenario_tier": scenario_tier,
        "base_incoming": incoming,
        "effective_incoming": effective_incoming,
        "simulation": simulation,
        "roster": {
            "physician_count": len(doctors),
            "effective_physician_count": effective_physicians,
            "specialty_breakdown": dict(specialties),
            "cardiologists": cardiologists,
            "emergency_medicine": emergency_mds,
            "trauma_capable": trauma_mds,
            "icu_nurses": icu_nurses,
            "er_nurses": er_nurses,
            "icu_nurse_gap": icu_nurse_gap,
            "er_nurse_gap": er_nurse_gap,
            "cardiology_gap": cardio_gap,
        },
        "equipment": {
            "ventilators": ventilators,
            "ultrasound": ultrasound,
            "inventory": profile.get("equipment", []),
        },
        "capacity": simulation["surge"],
        "scenario_assignment": profile.get("capacity", {}).get("scenario_assignment"),
    }


def _format_action_item(item: Any) -> str:
    if isinstance(item, str):
        return item
    if isinstance(item, dict):
        action = item.get("action") or item.get("text") or ""
        timeline = item.get("timeline") or item.get("deadline") or ""
        role = item.get("role") or item.get("specialty") or item.get("item") or ""
        headcount = item.get("headcount") or item.get("quantity")
        evidence = item.get("evidence") or item.get("reasoning") or ""
        parts = [p for p in [action, f"({role})" if role else "", f"×{headcount}" if headcount else "", timeline, evidence] if p]
        return " — ".join(parts[:3]) + (f". {evidence}" if evidence and evidence not in parts else "")
    return str(item)


async def _gemini_scenario_synthesis(
    context: dict[str, Any],
    rag_hits: list[dict[str, Any]],
    scenario_tier: str,
) -> dict[str, Any]:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise GeminiAgentError("GEMINI_API_KEY is required for scenario agent synthesis")

    rag_snippets = [{"content": hit.get("content", "")[:220], "source": hit.get("metadata", {}).get("source")} for hit in rag_hits[:6]]
    tier_rules = {
        "elevated": (
            "Scale to THIS scenario only. Temporary shift adjustments OK; no permanent hires unless overflow > 0. "
            "Max 1-2 immediate actions. No 60-day equipment procurement."
        ),
        "surge": (
            "Surge staffing and short-term measures only. Permanent hires only if overflow or critical patients remain after reroute."
        ),
        "critical": "Full surge response appropriate including partner routing and staffing augmentation.",
    }
    prompt = (
        "You are the Hospital OS Scenario Agent for production emergency planning. "
        f"Scenario urgency tier: {scenario_tier}. {tier_rules.get(scenario_tier, tier_rules['elevated'])} "
        "Return ONLY valid JSON with keys: "
        "executive_summary (string, 2-3 sentences with specific numbers from context), "
        "routing_summary (string), "
        "staffing_actions (array of {action, timeline, headcount, role, evidence}), "
        "physician_actions (array of {action, timeline, headcount, specialty, evidence}), "
        "equipment_actions (array of {action, timeline, item, evidence}), "
        "immediate_actions (string array, 3-5 items), "
        "partner_routing (string), "
        "confidence (low|medium|high), "
        "limitations (string array). "
        "RULES: Use ONLY numbers from the provided context — never invent bed counts or staff totals. "
        "Recommendations MUST be proportional to effective_incoming and pressure_score in context. "
        "Do NOT recommend hiring, procurement, or surge activation when can_handle is true and pressure_score is under 20. "
        "Chronic hospital gaps in roster are background only — do not action them unless this scenario's load triggers overflow. "
        "Ignore historical incident evidence that does not match this scenario's acuity. "
        "Never blame individual clinicians. System-level recommendations only. "
        f"Operational context: {json.dumps(context)} "
        f"Clinical evidence snippets: {json.dumps(rag_snippets)}"
    )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = getattr(response, "text", None) or ""
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        parsed = json.loads(cleaned)
        parsed["clinical_evidence"] = [hit.get("content", "")[:180] for hit in rag_hits[:3]]
        parsed["agent_powered"] = True
        parsed["source"] = "Gemini Scenario Synthesis Agent"
        parsed["scenario_tier"] = scenario_tier
        return parsed
    except GeminiAgentError:
        raise
    except Exception as exc:
        raise GeminiAgentError(f"Gemini scenario synthesis failed: {exc}") from exc


async def run_scenario_agent(
    hospital_id: str,
    profile: dict[str, Any],
    incoming: dict[str, int],
    specification: str = "",
) -> dict[str, Any]:
    context = build_operational_context(profile, incoming, specification)
    scenario_tier = context["scenario_tier"]

    if scenario_tier == "routine":
        rag_hits: list[dict[str, Any]] = []
        synthesis = _build_routine_scenario_response(context)
    else:
        query_terms = " ".join(
            filter(
                None,
                [
                    "staffing surge ICU emergency",
                    specification,
                    f"{context['effective_incoming']['critical']} critical patients",
                    "burn cardiac trauma" if specification else "",
                ],
            )
        )
        rag_hits = retrieve_context(hospital_id, query_terms, top_k=6)
        synthesis = await _gemini_scenario_synthesis(context, rag_hits, scenario_tier)

    limitations = list(synthesis.get("limitations", []))
    if not CHROMA_AVAILABLE:
        limitations.append(
            "Clinical evidence retrieval is unavailable (chromadb not installed). "
            "Run: pip install chromadb"
        )
    elif not rag_hits:
        limitations.append(
            "No indexed clinical evidence matched this scenario. "
            "Run rag-index after loading hospital digest."
        )

    def flatten_actions(key: str) -> list[str]:
        return [_format_action_item(item) for item in synthesis.get(key, [])]

    return {
        "status": "completed",
        "generated_at": utc_now(),
        "hospital_id": hospital_id,
        "agent_pipeline": SCENARIO_AGENT_PIPELINE,
        "specification": context["specification"],
        "parsed_specification": context["parsed_specification"],
        "incoming": context["effective_incoming"],
        "simulation": {
            "can_handle": context["simulation"]["can_handle"],
            "verdict": context["simulation"]["verdict"],
            "critical_ok": context["simulation"]["critical_ok"],
            "moderate_ok": context["simulation"]["moderate_ok"],
            "minor_ok": context["simulation"]["minor_ok"],
            "pressure_score": context["simulation"]["pressure_score"],
            "total_incoming": context["simulation"]["total_incoming"],
            "capacity": context["simulation"]["capacity"],
            "overflow": context["simulation"]["overflow"],
            "routing_advice": context["simulation"]["routing_advice"],
        },
        "executive_summary": synthesis.get("executive_summary", ""),
        "routing_summary": synthesis.get("routing_summary") or context["simulation"]["routing_advice"],
        "staffing_actions": flatten_actions("staffing_actions"),
        "physician_actions": flatten_actions("physician_actions"),
        "equipment_actions": flatten_actions("equipment_actions"),
        "immediate_actions": synthesis.get("immediate_actions", []),
        "partner_routing": synthesis.get("partner_routing", ""),
        "clinical_evidence": synthesis.get("clinical_evidence", []),
        "operational_context": {
            "roster": context["roster"],
            "capacity": context["capacity"],
        },
        "confidence": synthesis.get("confidence", "medium"),
        "limitations": limitations,
        "scenario_tier": scenario_tier,
        "agent_powered": synthesis.get("agent_powered", False),
        "source": synthesis.get("source", "Scenario Agent"),
        "structured_report": synthesis,
    }
