import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

# Always load backend/.env regardless of process working directory
load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from app.api.v1.routes import router as api_router

app = FastAPI(title="HealthOS API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


def _frontend_dist() -> Path:
    default = Path(__file__).resolve().parents[1] / "frontend_dist"
    return Path(os.getenv("FRONTEND_DIST", str(default)))


def _mount_frontend() -> None:
    dist = _frontend_dist()
    if not dist.exists():
        return

    assets_dir = dist / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/")
    async def serve_index():
        return FileResponse(dist / "index.html")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        candidate = dist / full_path
        if candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(dist / "index.html")


_mount_frontend()
