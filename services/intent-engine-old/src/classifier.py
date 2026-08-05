"""Intent classification using local LLM via Ollama"""

import json
import logging
import time
import asyncio
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

import httpx
import ollama
from pydantic import BaseModel, Field

from config import settings
from prompts import (
    build_classification_prompt,
    build_simplified_prompt,
    INTENT_CATEGORIES,
    FEW_SHOT_EXAMPLES
)

logger = logging.getLogger(__name__)


class ClassificationResult(BaseModel):
    """Result of intent classification"""
    intent: str = Field(..., description="Primary intent category")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")
    skill_level: int = Field(..., ge=1, le=10, description="Attacker skill level")
    reasoning: str = Field(..., description="Explanation for classification")
    secondary_intents: List[str] = Field(default_factory=list)
    adaptation_hint: str = Field(default="", description="Suggestion for response adaptation")
    processing_time_ms: float = Field(default=0.0, description="Classification latency")


@dataclass
class SessionContext:
    """Cached session context for faster classification"""
    session_id: str
    org_profile: dict
    attacker_ip: str
    attacker_country: Optional[str]
    start_time: float
    commands: List[Dict]
    previous_intents: List[str]
    last_classification: Optional[ClassificationResult] = None


class IntentClassifier:
    """LLM-based intent classifier for cloud honeypot"""

    def __init__(self):
        self.client = ollama.AsyncClient(host=settings.OLLAMA_URL)
        self.model = settings.MODEL_NAME
        self.session_cache: Dict[str, SessionContext] = {}
        self._model_ready = False

    async def initialize(self):
        """Initialize and verify model availability"""
        try:
            models = await self.client.list()
            model_names = [m["name"] for m in models.get("models", [])]
            if self.model not in model_names:
                logger.info(f"Pulling model {self.model}...")
                await self.client.pull(self.model)
            self._model_ready = True
            logger.info(f"Intent classifier ready with model: {self.model}")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama: {e}")
            self._model_ready = False

    def get_or_create_session(self, session_id: str, org_profile: dict, attacker_ip: str, attacker_country: Optional[str]) -> SessionContext:
        """Get or create session context"""
        if session_id not in self.session_cache:
            self.session_cache[session_id] = SessionContext(
                session_id=session_id,
                org_profile=org_profile,
                attacker_ip=attacker_ip,
                attacker_country=attacker_country,
                start_time=time.time(),
                commands=[],
                previous_intents=[]
            )
        return self.session_cache[session_id]

    def add_command(self, session_id: str, command: Dict):
        """Add command to session history"""
        if session_id in self.session_cache:
            self.session_cache[session_id].commands.append(command)
            # Keep only recent commands
            if len(self.session_cache[session_id].commands) > settings.MAX_COMMANDS_HISTORY:
                self.session_cache[session_id].commands = self.session_cache[session_id].commands[-settings.MAX_COMMANDS_HISTORY:]

    def update_intent(self, session_id: str, intent: str):
        """Track intent history"""
        if session_id in self.session_cache:
            self.session_cache[session_id].previous_intents.append(intent)
            if len(self.session_cache[session_id].previous_intents) > 10:
                self.session_cache[session_id].previous_intents = self.session_cache[session_id].previous_intents[-10:]

    async def classify(
        self,
        session_id: str,
        organization_profile: str,
        commands: List[Dict],
        context: Dict
    ) -> ClassificationResult:
        """Classify attacker intent from command sequence"""

        start_time = time.time()

        if not self._model_ready:
            await self.initialize()

        if not self._model_ready:
            return ClassificationResult(
                intent="unknown",
                confidence=0.0,
                skill_level=1,
                reasoning="Model not available",
                adaptation_hint="No adaptation",
                processing_time_ms=(time.time() - start_time) * 1000
            )

        # Get org profile
        org_profiles = {
            "tech-startup-aws": {"name": "TechStart Inc", "industry": "technology", "cloud_provider": "aws"},
            "northbridge-healthcare": {"name": "Northbridge Healthcare", "industry": "healthcare", "cloud_provider": "aws"},
            "azure-enterprise": {"name": "Azure Enterprise Corp", "industry": "financial-services", "cloud_provider": "azure"},
            "gcp-media": {"name": "GCP Media Studios", "industry": "media", "cloud_provider": "gcp"},
        }
        org_profile = org_profiles.get(organization_profile, org_profiles["tech-startup-aws"])

        # Get session context
        attacker_ip = context.get("attacker_ip", "10.0.0.1")
        attacker_country = context.get("attacker_country")
        session_duration = context.get("session_duration_seconds", time.time() - self.session_cache.get(session_id, SessionContext("", {}, "", None, time.time(), [], [])).start_time)

        # Build prompt
        prompt = build_simplified_prompt(
            org_profile=org_profile,
            attacker_ip=attacker_ip,
            attacker_country=attacker_country,
            session_duration=session_duration,
            command_count=len(commands),
            commands=commands
        )

        # Add few-shot examples
        full_prompt = FEW_SHOT_EXAMPLES + "\n" + prompt

        try:
            # Call Ollama
            response = await self.client.generate(
                model=self.model,
                prompt=full_prompt,
                format="json",
                options={
                    "temperature": 0.1,
                    "top_p": 0.9,
                    "num_predict": 200,
                }
            )

            # Parse response
            result_text = response.get("response", "{}")
            result = json.loads(result_text)

            # Validate intent
            valid_intents = [c for c in INTENT_CATEGORIES.keys()] + ["unknown"]
            if result.get("intent") not in valid_intents:
                result["intent"] = "unknown"
                result["confidence"] = 0.0

            # Ensure required fields
            classification = ClassificationResult(
                intent=result.get("intent", "unknown"),
                confidence=max(0.0, min(1.0, result.get("confidence", 0.0))),
                skill_level=max(1, min(10, result.get("skill_level", 5))),
                reasoning=result.get("reasoning", "No reasoning provided"),
                secondary_intents=result.get("secondary_intents", []),
                adaptation_hint=result.get("adaptation_hint", ""),
                processing_time_ms=(time.time() - start_time) * 1000
            )

            # Update session
            if session_id in self.session_cache:
                self.session_cache[session_id].last_classification = classification
                self.session_cache[session_id].previous_intents.append(classification.intent)

            logger.info(f"Classified session {session_id}: {classification.intent} (confidence: {classification.confidence:.2f})")
            return classification

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            return ClassificationResult(
                intent="unknown",
                confidence=0.0,
                skill_level=1,
                reasoning="Failed to parse LLM response",
                adaptation_hint="No adaptation",
                processing_time_ms=(time.time() - start_time) * 1000
            )
        except Exception as e:
            logger.error(f"Classification error: {e}")
            return ClassificationResult(
                intent="unknown",
                confidence=0.0,
                skill_level=1,
                reasoning=f"Classification failed: {str(e)}",
                adaptation_hint="No adaptation",
                processing_time_ms=(time.time() - start_time) * 1000
            )


class RuleBasedClassifier:
    """Fast rule-based fallback classifier"""

    # Command patterns for each intent
    PATTERNS = {
        "cloud_recon": [
            "describe-instances", "describe-volumes", "describe-vpcs", "describe-subnets",
            "describe-security-groups", "list-buckets", "list-users", "list-roles",
            "list-vms", "list-storage", "compute instances list", "iam service-accounts list"
        ],
        "credential_hunting": [
            "cat ~/.aws/credentials", "cat ~/.ssh/", "env | grep", "printenv",
            "get-caller-identity", "list-access-keys", "assume-role",
            "keyvault secret", "auth list", "gcloud auth"
        ],
        "privilege_escalation": [
            "attach-user-policy", "put-user-policy", "create-policy",
            "role assignment create", "add-iam-policy-binding",
            "create-role", "attach-role-policy"
        ],
        "data_access": [
            "s3 cp", "s3 sync", "s3api get-object", "storage blob download",
            "storage blob list", "gsutil cp", "gsutil rsync",
            "describe-db-instances", "dynamodb scan", "sql instances"
        ],
        "persistence": [
            "create-access-key", "create-user", "create-key-pair",
            "create-function", "ad sp create", "keyvault set-policy",
            "service-accounts create", "compute ssh"
        ],
        "lateral_movement": [
            "ssh ", "scp ", "rsync ", "run-instances",
            "ssm start-session", "vm run-command",
            "compute ssh", "compute scp", "kubectl exec"
        ]
    }

    @classmethod
    def classify(cls, commands: List[Dict]) -> ClassificationResult:
        """Fast rule-based classification"""
        command_strings = []
        for cmd in commands:
            c = cmd.get("cmd", cmd.get("command", "")).lower()
            command_strings.append(c)

        all_commands = " ".join(command_strings)

        scores = {}
        for intent, patterns in cls.PATTERNS.items():
            score = sum(1 for p in patterns if p in all_commands)
            if score > 0:
                scores[intent] = score

        if not scores:
            return ClassificationResult(
                intent="unknown",
                confidence=0.1,
                skill_level=1,
                reasoning="No matching patterns found",
                adaptation_hint="No adaptation needed"
            )

        # Get highest scoring intent
        best_intent = max(scores, key=scores.get)
        confidence = min(0.9, scores[best_intent] * 0.2 + 0.3)

        return ClassificationResult(
            intent=best_intent,
            confidence=confidence,
            skill_level=min(10, scores[best_intent] + 2),
            reasoning=f"Rule-based: matched {scores[best_intent]} patterns for {best_intent}",
            adaptation_hint=cls._get_adaptation_hint(best_intent),
            processing_time_ms=1.0
        )

    @staticmethod
    def _get_adaptation_hint(intent: str) -> str:
        hints = {
            "cloud_recon": "Provide rich, detailed resource listings",
            "credential_hunting": "Plant fake credentials in expected locations",
            "privilege_escalation": "Fail first, then grant fake admin after persistence",
            "data_access": "Create tempting fake data files",
            "persistence": "Allow and monitor backdoor creation",
            "lateral_movement": "Fabricate internal network topology"
        }
        return hints.get(intent, "No specific adaptation")