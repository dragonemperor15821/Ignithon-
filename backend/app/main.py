from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import analysis, case, evidence, extraction, health, integrity, timeline

app = FastAPI(
    title="CaseForge API",
    description="Digital Evidence Intelligence & Incident Reconstruction",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(evidence.router)
app.include_router(extraction.router)
app.include_router(timeline.router)
app.include_router(analysis.router)
app.include_router(case.router)
app.include_router(integrity.router)
