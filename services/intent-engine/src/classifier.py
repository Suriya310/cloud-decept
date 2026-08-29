"""Intent classification using LLM Gateway"""

import json
import logging
import time
from typing import Dict, List, Optional, Any

import httpx
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


class IntentClassifier:
    """LLM Gateway-based intent classifier for cloud honeypot"""

    def __init__(self):
        self.llm_gateway_url = settings.LLM_GATEWAY_URL
        self.client: Optional[httpx.AsyncClient] = None
        self._model_ready = False

    async def initialize(self):
        """Initialize HTTP client"""
        self.client = httpx.AsyncClient(timeout=120.0)
        try:
            # Test connection to LLM Gateway
            resp = await self.client.get(f"{self.llm_gateway_url}/health")
            if resp.status_code == 200:
                self._model_ready = True
                logger.info(f"Intent classifier connected to LLM Gateway: {self.llm_gateway_url}")
            else:
                logger.warning(f"LLM Gateway health check failed: {resp.status_code}")
        except Exception as e:
            logger.warning(f"LLM Gateway not available yet: {e}")

    async def close(self):
        """Close HTTP client"""
        if self.client:
            await self.client.aclose()

    async def classify(
        self,
        session_id: str,
        organization_profile: str,
        commands: List[Dict],
        context: Dict
    ) -> ClassificationResult:
        """Classify attacker intent from command sequence via LLM Gateway"""

        start_time = time.time()

        if not self._model_ready:
            await self.initialize()

        if not self._model_ready:
            # Fallback to rule-based
            return RuleBasedClassifier.classify(commands)

        # Get org profile
        org_profiles = {
            "tech-startup-aws": {"name": "TechStart Inc", "industry": "technology", "cloud_provider": "aws"},
            "northbridge-healthcare": {"name": "Northbridge Healthcare", "industry": "healthcare", "cloud_provider": "aws"},
            "azure-enterprise": {"name": "Azure Enterprise Corp", "industry": "financial-services", "cloud_provider": "azure"},
            "gcp-media": {"name": "GCP Media Studios", "industry": "media", "cloud_provider": "gcp"},
        }
        org_profile = org_profiles.get(organization_profile, org_profiles["tech-startup-aws"])

        # Get context
        attacker_ip = context.get("attacker_ip", "10.0.0.1")
        attacker_country = context.get("attacker_country")
        session_duration = context.get("session_duration_seconds", 0)
        previous_intents = context.get("previous_intents", [])

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
            # Call LLM Gateway
            response = await self.client.post(
                f"{self.llm_gateway_url}/generate",
                json={
                    "prompt": full_prompt,
                    "system_prompt": "You are a cybersecurity expert classifying attacker intent from honeypot logs. Respond ONLY with valid JSON.",
                    "model": settings.MODEL_NAME,
                    "temperature": 0.1,
                    "max_tokens": 512,
                }
            )

            if response.status_code != 200:
                raise Exception(f"LLM Gateway returned {response.status_code}: {response.text}")

            data = response.json()
            result_text = data.get("response", "{}")

            # Parse response robustly.
            # Small local models may return markdown fences or truncated/non-JSON text.
            try:
                result = json.loads(result_text)
            except json.JSONDecodeError:
                cleaned = result_text.strip()

                if cleaned.startswith("```"):
                    lines = cleaned.splitlines()
                    if lines and lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].strip() == "```":
                        lines = lines[:-1]
                    cleaned = "\n".join(lines).strip()

                # Try extracting the outermost JSON object.
                start = cleaned.find("{")
                end = cleaned.rfind("}")

                if start >= 0 and end > start:
                    result = json.loads(cleaned[start:end + 1])
                else:
                    raise

            # Validate intent
            valid_intents = list(INTENT_CATEGORIES.keys()) + ["unknown"]
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

            logger.info(f"Classified session {session_id}: {classification.intent} (confidence: {classification.confidence:.2f})")
            return classification

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {e}")
            return RuleBasedClassifier.classify(commands)
        except Exception as e:
            logger.error(f"Classification error: {type(e).__name__}: {e}", exc_info=True)
            # Fallback to rule-based
            return RuleBasedClassifier.classify(commands)


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
                adaptation_hint="No adaptation needed",
                processing_time_ms=1.0
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