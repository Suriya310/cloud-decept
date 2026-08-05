"""FastAPI service for Intent Prediction Engine"""

import logging
import time
from contextlib import asynccontextmanager
from typing import Dict, List, Optional, Any
from datetime import datetime

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from config import settings
from classifier import IntentClassifier, RuleBasedClassifier, ClassificationResult, SessionContext

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global classifier instance
classifier: Optional[IntentClassifier] = None
rule_classifier = RuleBasedClassifier()


# Request/Response models
class ClassifyRequest(BaseModel):
    session_id: str = Field(..., description="Unique session identifier")
    organization_profile: str = Field(default="tech-startup-aws", description="Org profile name")
    commands: List[Dict[str, Any]] = Field(default_factory=list, description="Command history")
    context: Dict[str, Any] = Field(default_factory=dict, description="Session context")


class ClassifyResponse(BaseModel):
    intent: str
    confidence: float
    skill_level: int
    reasoning: str
    secondary_intents: List[str] = []
    adaptation_hint: str = ""
    processing_time_ms: float
    fallback_used: bool = False


class HealthResponse(BaseModel):
    status: str
    model: str
    model_ready: bool
    uptime_seconds: float


# Session storage
active_sessions: Dict[str, SessionContext] = {}
start_time = time.time()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global classifier
    classifier = IntentClassifier()
    await classifier.initialize()
    logger.info("Intent Engine started")
    yield
    logger.info("Intent Engine shutting down")


app = FastAPI(
    title="CloudDecept Intent Prediction Engine",
    description="AI-powered attacker intent classification for cloud honeypot",
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


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy" if classifier and classifier._model_ready else "degraded",
        model=settings.MODEL_NAME,
        model_ready=classifier._model_ready if classifier else False,
        uptime_seconds=time.time() - start_time
    )


@app.post("/classify", response_model=ClassifyResponse)
async def classify_intent(request: ClassifyRequest):
    """Classify attacker intent from command sequence"""

    start = time.time()
    fallback_used = False

    if not classifier or not classifier._model_ready:
        # Use rule-based fallback
        result = rule_classifier.classify(request.commands)
        fallback_used = True
    else:
        try:
            result = await classifier.classify(
                session_id=request.session_id,
                organization_profile=request.organization_profile,
                commands=request.commands,
                context=request.context
            )
        except Exception as e:
            logger.error(f"LLM classification failed, using fallback: {e}")
            result = rule_classifier.classify(request.commands)
            fallback_used = True

    # Update session tracking
    if request.session_id not in active_sessions:
        active_sessions[request.session_id] = SessionContext(
            session_id=request.session_id,
            org_profile={},
            attacker_ip=request.context.get("attacker_ip", "unknown"),
            attacker_country=request.context.get("attacker_country"),
            start_time=time.time(),
            commands=[],
            previous_intents=[]
        )

    session = active_sessions[request.session_id]
    session.commands.extend(request.commands[-10:])
    session.previous_intents.append(result.intent)

    return ClassifyResponse(
        intent=result.intent,
        confidence=result.confidence,
        skill_level=result.skill_level,
        reasoning=result.reasoning,
        secondary_intents=result.secondary_intents,
        adaptation_hint=result.adaptation_hint,
        processing_time_ms=result.processing_time_ms,
        fallback_used=fallback_used
    )


@app.get("/sessions/{session_id}")
async def get_session(session_id: str):
    """Get session context and history"""
    if session_id not in active_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    session = active_sessions[session_id]
    return {
        "session_id": session.session_id,
        "commands_count": len(session.commands),
        "intents_history": session.previous_intents,
        "last_intent": session.previous_intents[-1] if session.previous_intents else None,
        "uptime": time.time() - session.start_time
    }


@app.delete("/sessions/{session_id}")
async def clear_session(session_id: str):
    """Clear session data"""
    active_sessions.pop(session_id, None)
    if classifier:
        classifier.session_cache.pop(session_id, None)
    return {"status": "cleared"}


@app.get("/stats")
async def get_stats():
    """Get engine statistics"""
    return {
        "active_sessions": len(active_sessions),
        "model": settings.MODEL_NAME,
        "model_ready": classifier._model_ready if classifier else False,
        "fallback_available": True,
        "uptime_seconds": time.time() - start_time
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)