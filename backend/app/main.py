import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
