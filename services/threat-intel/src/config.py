import os
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Threat Intelligence Engine settings"""

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 8005
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # LLM Gateway (for summarization)
    LLM_GATEWAY_URL: str = "http://llm-gateway:8003"

    # Legacy Ollama (fallback)
    OLLAMA_URL: str = "http://ollama:11434"
    MODEL_NAME: str = "llama3.2:3b"

    # Databases
    CLICKHOUSE_HOST: str = "clickhouse"
    CLICKHOUSE_PORT: int = 9000
    CLICKHOUSE_DB: str = "deception"
    CLICKHOUSE_USER: str = "deception"
    CLICKHOUSE_PASSWORD: str = "deception123"

    POSTGRES_HOST: str = "postgres"
    POSTGRES_PORT: int = 5432
    POSTGRES_DB: str = "deception"
    POSTGRES_USER: str = "deception"
    POSTGRES_PASSWORD: str = "deception123"

    # Event Collector
    EVENT_COLLECTOR_URL: str = "http://event-collector:8000"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "case_sensitive": True,
        "extra": "ignore"
    }


settings = Settings()