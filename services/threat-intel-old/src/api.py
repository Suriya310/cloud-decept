"""Threat Intelligence Engine Service"""

import logging
from contextlib import asynccontextmanager
from typing import Dict, Any, List, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
from intel import (
    IOCExtractor,
    MITREMapper,
    SessionSummarizer,
    ExtractedIOC,
    MappedTechnique
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global instances
ioc_extractor = IOCExtractor()
mitre_mapper = MITREMapper()
session_summarizer: Optional[SessionSummarizer] = None


# Request/Response models
class AnalyzeSessionRequest(BaseModel):
    session_id: str
    commands: List[Dict[str, Any]] = Field(default_factory=list)
    outputs: List[str] = Field(default_factory=list)
    intent_history: List[str] = Field(default_factory=list)
    attacker_ip: str = "unknown"
    attacker_country: str = "unknown"
    duration_seconds: int = 0


class IOCResponse(BaseModel):
    type: str
    value: str
    context: str
    confidence: float
    first_seen: str


class TechniqueResponse(BaseModel):
    technique_id: str
    name: str
    tactic: str
    severity: str
    trigger: str
    confidence: float


class SessionSummaryResponse(BaseModel):
    skill_level: int
    primary_objective: str
    techniques_summary: str
    iocs_of_interest: List[str]
    risk_level: str
    defensive_recommendations: List[str]
    narrative: str
    generated_at: str
    model: str


class AnalysisResponse(BaseModel):
    session_id: str
    iocs: List[IOCResponse]
    techniques: List[TechniqueResponse]
    tactic_summary: Dict[str, int]
    summary: Optional[SessionSummaryResponse] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global session_summarizer
    session_summarizer = SessionSummarizer(
        ollama_url=settings.OLLAMA_URL,
        model=settings.MODEL_NAME
    )
    logger.info("Threat Intelligence Engine started")
    yield
    logger.info("Threat Intelligence Engine shutting down")


app = FastAPI(
    title="CloudDecept Threat Intelligence Engine",
    description="MITRE ATT&CK mapping, IOC extraction, and session summarization",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "threat-intel",
        "summarizer_ready": session_summarizer is not None
    }


@app.post("/analyze", response_model=AnalysisResponse)
async def analyze_session(request: AnalyzeSessionRequest, background_tasks: BackgroundTasks):
    """Analyze a session for IOCs, MITRE techniques, and generate summary"""

    # Extract IOCs
    all_text = " ".join([
        cmd.get("cmd", cmd.get("command", "")) + " " + cmd.get("output", "")
        for cmd in request.commands
    ] + request.outputs)

    iocs = ioc_extractor.extract(all_text)

    # Map to MITRE
    techniques = mitre_mapper.map_commands(request.commands)
    tactic_summary = mitre_mapper.get_tactic_summary(techniques)

    # Generate summary in background
    summary = None
    if session_summarizer:
        session_data = {
            "session_id": request.session_id,
            "commands": request.commands,
            "intent_history": request.intent_history,
            "iocs": iocs,
            "techniques": techniques,
            "attacker_ip": request.attacker_ip,
            "attacker_country": request.attacker_country,
            "duration_seconds": request.duration_seconds
        }
        summary_dict = await session_summarizer.summarize(session_data)
        summary = SessionSummaryResponse(**summary_dict)

    return AnalysisResponse(
        session_id=request.session_id,
        iocs=[IOCResponse(**ioc.__dict__) for ioc in iocs],
        techniques=[TechniqueResponse(**tech.__dict__) for tech in techniques],
        tactic_summary=tactic_summary,
        summary=summary
    )


@app.post("/extract-iocs")
async def extract_iocs(text: str):
    """Extract IOCs from raw text"""
    iocs = ioc_extractor.extract(text)
    return {"iocs": [IOCResponse(**ioc.__dict__) for ioc in iocs]}


@app.post("/map-mitre")
async def map_mitre(commands: List[Dict[str, Any]]):
    """Map commands to MITRE ATT&CK techniques"""
    techniques = mitre_mapper.map_commands(commands)
    tactic_summary = mitre_mapper.get_tactic_summary(techniques)
    return {
        "techniques": [TechniqueResponse(**tech.__dict__) for tech in techniques],
        "tactic_summary": tactic_summary
    }


@app.post("/summarize")
async def summarize(request: AnalyzeSessionRequest):
    """Generate LLM summary of session"""
    if not session_summarizer:
        raise HTTPException(status_code=503, detail="Summarizer not ready")

    session_data = {
        "session_id": request.session_id,
        "commands": request.commands,
        "intent_history": request.intent_history,
        "iocs": ioc_extractor.extract(" ".join([
            cmd.get("cmd", cmd.get("command", "")) + " " + cmd.get("output", "")
            for cmd in request.commands
        ])),
        "techniques": mitre_mapper.map_commands(request.commands),
        "attacker_ip": request.attacker_ip,
        "attacker_country": request.attacker_country,
        "duration_seconds": request.duration_seconds
    }

    summary_dict = await session_summarizer.summarize(session_data)
    return SessionSummaryResponse(**summary_dict)


@app.get("/mitre-catalog")
async def get_mitre_catalog():
    """Get all known MITRE cloud techniques"""
    from intel import MITRE_CLOUD_TECHNIQUES
    return {"techniques": MITRE_CLOUD_TECHNIQUES}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8002)