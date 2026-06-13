import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2] / "data"
HOSPITAL_PROFILES_DIR = BASE_DIR / "hospital_profiles"
MASTER_REPORTS_DIR = BASE_DIR / "hospital_os_reports"
INCIDENT_DIGESTS_DIR = BASE_DIR / "incident_digests"  # deprecated — no longer written; kept for migration cleanup only
HOSPITAL_MEMORY_DIR = BASE_DIR / "hospital_memory"
CHROMA_STORE_DIR = BASE_DIR / "chroma"

for directory in [
    HOSPITAL_PROFILES_DIR,
    MASTER_REPORTS_DIR,
    HOSPITAL_MEMORY_DIR,
    CHROMA_STORE_DIR,
]:
    directory.mkdir(parents=True, exist_ok=True)


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _path_for(directory: Path, hospital_id: str, suffix: str = ".json") -> Path:
    return directory / f"{slugify(hospital_id)}{suffix}"


def load_json(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, payload: dict[str, Any]) -> Path:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def load_hospital_profile(hospital_id: str) -> dict[str, Any] | None:
    return load_json(_path_for(HOSPITAL_PROFILES_DIR, hospital_id))


def save_hospital_profile(hospital_id: str, payload: dict[str, Any]) -> Path:
    return save_json(_path_for(HOSPITAL_PROFILES_DIR, hospital_id), payload)


def save_master_report(hospital_id: str, payload: dict[str, Any]) -> Path:
    return save_json(_path_for(MASTER_REPORTS_DIR, hospital_id), payload)


def load_master_report(hospital_id: str) -> dict[str, Any] | None:
    return load_json(_path_for(MASTER_REPORTS_DIR, hospital_id))


def save_incident_digest(hospital_id: str, payload: dict[str, Any]) -> None:
    """No-op: incident context lives inside master reports and Chroma, not separate JSON files."""
    del hospital_id, payload


def load_incident_digest(hospital_id: str) -> dict[str, Any] | None:
    """Deprecated — never loaded; returns None."""
    del hospital_id
    return None


def save_hospital_memory(hospital_id: str, payload: dict[str, Any]) -> Path:
    return save_json(_path_for(HOSPITAL_MEMORY_DIR, hospital_id), payload)


def load_hospital_memory(hospital_id: str) -> dict[str, Any] | None:
    return load_json(_path_for(HOSPITAL_MEMORY_DIR, hospital_id))
