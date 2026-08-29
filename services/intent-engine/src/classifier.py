"""Deterministic rule-based intent classifier"""

import logging
import time
from typing import Dict, List, Any
from pydantic import BaseModel, Field

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


class RuleBasedClassifier:
    """Deterministic rule-based intent classifier for cloud honeypot"""

    # Command patterns for each intent
    PATTERNS = {
        "cloud_recon": [
            "describe-instances", "describe-volumes", "describe-vpcs", "describe-subnets",
            "describe-security-groups", "list-buckets", "list-users", "list-roles",
            "list-vms", "list-storage", "compute instances list", "iam service-accounts list",
            "describe-instances", "describe-images", "describe-key-pairs", "describe-addresses",
            "aws ec2 describe", "aws s3 ls", "aws iam list", "az resource list", "az storage account list",
            "gcloud compute instances list", "gsutil ls", "gcloud storage buckets list"
        ],
        "credential_hunting": [
            "cat ~/.aws/credentials", "cat ~/.ssh/", "env | grep", "printenv",
            "get-caller-identity", "list-access-keys", "assume-role",
            "keyvault secret", "auth list", "gcloud auth",
            "env | grep AWS", "env | grep AZURE", "env | grep GOOGLE",
            "find / -name \*.pem", "find / -name \*.key", "grep -r AKIA",
            "aws sts get-caller-identity", "aws iam list-access-keys", "aws secretsmanager list-secrets",
            "az keyvault secret list", "az keyvault certificate list", "gcloud secrets list",
            "gcloud iam service-accounts list"
        ],
        "privilege_escalation": [
            "attach-user-policy", "put-user-policy", "create-policy",
            "role assignment create", "add-iam-policy-binding",
            "create-role", "attach-role-policy",
            "sts assume-role", "iam create-policy", "iam put-user-policy",
            "az role assignment create", "az ad user add", "az ad group member add",
            "gcloud projects add-iam-policy-binding", "gcloud iam roles create",
            "sudo", "su -", "chmod 777", "chown root", "usermod -aG",
            "aws iam attach-user-policy", "aws iam put-user-policy", "aws iam create-policy"
        ],
        "data_access": [
            "s3 cp", "s3 sync", "s3api get-object", "storage blob download",
            "storage blob list", "gsutil cp", "gsutil rsync",
            "describe-db-instances", "dynamodb scan", "sql instances",
            "aws s3 cp", "aws s3 sync", "aws s3api get-object", "aws s3api copy-object",
            "aws rds describe-db-instances", "aws dynamodb scan", "aws dynamodb query",
            "az storage blob download", "az storage blob list", "az storage blob upload",
            "az cosmosdb sql query", "az postgres flexible-server execute",
            "gsutil cp", "gsutil rsync", "gsutil mb", "gcloud storage cp",
            "gcloud sql instances list", "gcloud firestore export",
            "mysqldump", "pg_dump", "mongodump", "mongodb export"
        ],
        "persistence": [
            "create-access-key", "create-user", "create-key-pair",
            "create-function", "ad sp create", "keyvault set-policy",
            "service-accounts create", "compute ssh",
            "aws iam create-access-key", "aws iam create-user", "aws iam create-login-profile",
            "aws ec2 create-key-pair", "aws lambda create-function", "aws iam create-role",
            "az ad sp create-for-rbac", "az keyvault set-policy", "az keyvault certificate import",
            "gcloud iam service-accounts create", "gcloud compute ssh", "gcloud functions deploy",
            "ssh-keygen", "crontab -e", "systemctl enable", "launchctl load", "schtasks /create",
            "aws autoscaling create-auto-scaling-group", "aws ec2 launch-template"
        ],
        "lateral_movement": [
            "ssh ", "scp ", "rsync ", "run-instances",
            "ssm start-session", "vm run-command",
            "compute ssh", "compute scp", "kubectl exec",
            "aws ssm start-session", "aws ec2 run-instances", "aws ec2 terminate-instances",
            "az vm run-command invoke", "az vm start", "az vm stop",
            "gcloud compute ssh", "gcloud compute scp", "gcloud compute instances start",
            "kubectl exec", "kubectl attach", "docker exec",
            "pscopy", "psexec", "winrs", "enter-pssession"
        ]
    }

    @classmethod
    def classify(cls, commands: List[Dict]) -> ClassificationResult:
        """Fast deterministic rule-based classification"""
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
                processing_time_ms=0.5  # Very fast processing
            )

        # Get highest scoring intent
        best_intent = max(scores, key=scores.get)
        # Deterministic confidence calculation based on pattern matches
        confidence = min(0.95, 0.3 + (scores[best_intent] * 0.15))
        # Skill level based on number and diversity of patterns matched
        skill_level = min(10, 2 + scores[best_intent])

        return ClassificationResult(
            intent=best_intent,
            confidence=confidence,
            skill_level=skill_level,
            reasoning=f"Rule-based: matched {scores[best_intent]} patterns for {best_intent}",
            adaptation_hint=cls._get_adaptation_hint(best_intent),
            processing_time_ms=0.5  # Very fast processing
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