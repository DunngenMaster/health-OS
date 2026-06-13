import hashlib
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx

DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "hospital_profiles"
DATA_DIR.mkdir(parents=True, exist_ok=True)


def make_hospital_id(name: str, lat: float, lng: float) -> str:
    raw = f"{name}|{lat:.5f}|{lng:.5f}".lower()
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def field_value(
    value: Any,
    data_source_type: str,
    source: str = "",
) -> dict[str, Any]:
    return {
        "value": value,
        "data_source_type": data_source_type,
        "source": source,
    }


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


async def fetch_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> dict | list | None:
    try:
        response = await client.get(url, params=params, timeout=20.0)
        response.raise_for_status()
        return response.json()
    except Exception:
        return None


async def fetch_overpass(client: httpx.AsyncClient, query: str) -> dict | None:
    try:
        response = await client.post(
            "https://overpass-api.de/api/interpreter",
            data={"data": query},
            timeout=25.0,
        )
        response.raise_for_status()
        return response.json()
    except Exception:
        return None


def save_hospital_profile(hospital_id: str, profile: dict[str, Any]) -> Path:
    path = DATA_DIR / f"{slugify(hospital_id)}.json"
    path.write_text(json.dumps(profile, indent=2), encoding="utf-8")
    return path


def load_hospital_profile(hospital_id: str) -> dict[str, Any] | None:
    path = DATA_DIR / f"{slugify(hospital_id)}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
