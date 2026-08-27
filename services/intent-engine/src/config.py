import os
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import Optional


class Settings(BaseSettings):
    """Intent Engine settings"""

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8001
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # LLM Gateway (replaces direct Ollama)
    LLM_GATEWAY_URL: str = "http://llm-gateway:8003"

    # Legacy Ollama (for fallback)
    OLLAMA_URL: str = "http://ollama:11434"
    MODEL_NAME: str = "qwen2.5:1.5b"
    OLLAMA_TIMEOUT: int = 60

    # Redis
    REDIS_HOST: str = "redis"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: Optional[str] = None

    # Classification
    MAX_COMMANDS_HISTORY: int = 20
    CLASSIFICATION_TIMEOUT: int = 10
    MIN_CONFIDENCE_THRESHOLD: float = 0.3

    # Intent categories
    INTENT_CATEGORIES: list = [
        "cloud_recon",
        "credential_hunting",
        "privilege_escalation",
        "data_access",
        "persistence",
        "lateral_movement",
        "unknown"
    ]

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore"
    }


settings = Settings()