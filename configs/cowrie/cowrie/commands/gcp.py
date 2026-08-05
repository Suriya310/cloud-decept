# GCP CLI command emulation for Cowrie

import json
import random
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any


class GCPCommand:
    """GCP gcloud CLI command emulator"""

    def __init__(self, session):
        self.session = session
        self.project_id = "gcp-media-studios-prod"
        self.project_number = random.randint(100000000000, 999999999999)

    def get_fake_instances(self) -> List[Dict]:
        machine_types = ["n2-standard-2", "n2-standard-4", "c2-standard-8", "e2-medium"]
        zones = ["us-central1-a", "us-central1-b", "us-east1-b", "us-west1-a"]
        return [
            {
                "id": str(random.randint(1000000000000000000, 9999999999999999999)),
                "creationTimestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "name": f"{random.choice(['web', 'api', 'db', 'worker', 'ml'])}-{random.randint(100,999)}",
                "zone": f"https://www.googleapis.com/compute/v1/projects/{self.project_id}/zones/{random.choice(zones)}",
                "status": "RUNNING",
                "machineType": f"https://www.googleapis.com/compute/v1/projects/{self.project_id}/zones/us-central1-a/machineTypes/{random.choice(machine_types)}",
                "disks": [
                    {
                        "kind": "compute#attachedDisk",
                        "type": "PERSISTENT",
                        "mode": "READ_WRITE",
                        "source": f"https://www.googleapis.com/compute/v1/projects/{self.project_id}/zones/us-central1-a/disks/disk-{random.randint(100,999)}",
                        "deviceName": "persistent-disk-0",
                        "boot": True,
                        "autoDelete": True
                    }
                ],
                "networkInterfaces": [
                    {
                        "kind": "compute#networkInterface",
                        "network": f"https://www.googleapis.com/compute/v1/projects/{self.project_id}/global/networks/default",
                        "networkIP": f"10.0.{random.randint(1,255)}.{random.randint(1,255)}",
                        "accessConfigs": [
                            {
                                "kind": "compute#accessConfig",
                                "type": "ONE_TO_ONE_NAT",
                                "name": "External NAT",
                                "natIP": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}"
                            }
                        ]
                    }
                ],
                "metadata": {
                    "kind": "compute#metadata",
                    "items": [
                        {"key": "ssh-keys", "value": "user:ssh-rsa AAAAB3NzaC1yc2E..."}
                    ]
                },
                "serviceAccounts": [
                    {
                        "email": f"compute@{self.project_id}.iam.gserviceaccount.com",
                        "scopes": [
                            "https://www.googleapis.com/auth/devstorage.read_only",
                            "https://www.googleapis.com/auth/logging.write",
                            "https://www.googleapis.com/auth/monitoring.write",
                            "https://www.googleapis.com/auth/servicecontrol",
                            "https://www.googleapis.com/auth/service.management.readonly",
                            "https://www.googleapis.com/auth/trace.append"
                        ]
                    }
                ],
                "labels": {"environment": "production", "app": "core-platform"},
                "scheduling": {"preemptible": False, "onHostMaintenance": "MIGRATE", "automaticRestart": True},
                "cpuPlatform": "Intel Cascade Lake",
                "startRestricted": False,
                "deletionProtection": False,
                "shieldedInstanceConfig": {
                    "enableSecureBoot": False,
                    "enableVtpm": True,
                    "enableIntegrityMonitoring": True
                }
            }
            for _ in range(random.randint(3, 7))
        ]

    def get_fake_buckets(self) -> List[Dict]:
        return [
            {
                "kind": "storage#bucket",
                "id": f"{self.project_id}/{name}",
                "selfLink": f"https://www.googleapis.com/storage/v1/b/{name}",
                "projectNumber": str(self.project_number),
                "name": name,
                "timeCreated": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "location": "US",
                "storageClass": "STANDARD",
                "labels": {"environment": "production"},
                "versioning": {"enabled": True}
            }
            for name in ["data-lake", "logs-archive", "ml-checkpoints", "terraform-state", "cdn-assets"]
        ]

    def get_fake_service_accounts(self) -> List[Dict]:
        return [
            {
                "name": f"projects/{self.project_id}/serviceAccounts/compute@{self.project_id}.iam.gserviceaccount.com",
                "projectId": self.project_id,
                "uniqueId": str(random.randint(100000000000000000000, 999999999999999999999)),
                "email": f"compute@{self.project_id}.iam.gserviceaccount.com",
                "displayName": "Compute Engine default service account",
                "etag": "CAE=",
                "description": "",
                "oauth2ClientId": str(random.randint(100000000000000000000, 999999999999999999999)),
                "disabled": False
            },
            {
                "name": f"projects/{self.project_id}/serviceAccounts/ci-cd@{self.project_id}.iam.gserviceaccount.com",
                "projectId": self.project_id,
                "uniqueId": str(random.randint(100000000000000000000, 999999999999999999999)),
                "email": f"ci-cd@{self.project_id}.iam.gserviceaccount.com",
                "displayName": "CI/CD Service Account",
                "etag": "CAE=",
                "description": "Used for deployments",
                "oauth2ClientId": str(random.randint(100000000000000000000, 999999999999999999999)),
                "disabled": False
            }
        ]

    def execute(self, args: List[str]) -> Dict[str, Any]:
        if len(args) < 1:
            return {"error": "usage: gcloud <group> <command> [params]"}

        group = args[0]

        if group == "compute" and len(args) > 1:
            cmd = args[1]
            if cmd == "instances" and len(args) > 2 and args[2] == "list":
                return {"items": self.get_fake_instances()}
            elif cmd == "instances" and len(args) > 2 and args[2] == "describe":
                return self.get_fake_instances()[0]

        elif group == "storage" and len(args) > 1:
            cmd = args[1]
            if cmd == "buckets" and len(args) > 2 and args[2] == "list":
                return {"items": self.get_fake_buckets()}

        elif group == "iam" and len(args) > 1:
            cmd = args[1]
            if cmd == "service-accounts" and len(args) > 2 and args[2] == "list":
                return {"accounts": self.get_fake_service_accounts()}

        elif group == "config" and len(args) > 1 and args[1] == "get-value":
            if len(args) > 2 and args[2] == "project":
                return {"value": self.project_id}
            elif len(args) > 2 and args[2] == "account":
                return {"value": f"admin@{self.project_id}.iam.gserviceaccount.com"}

        elif group == "auth" and len(args) > 1 and args[1] == "list":
            return [
                {
                    "account": f"admin@{self.project_id}.iam.gserviceaccount.com",
                    "status": "ACTIVE"
                }
            ]

        return {"error": f"Unknown command: {' '.join(args)}"}


class CommandGCLOUD:
    """Cowrie command wrapper for GCP gcloud CLI"""

    def __init__(self, protocol):
        self.protocol = protocol
        self.gcp = GCPCommand(protocol)

    def call(self, args):
        if len(args) < 1:
            self.protocol.terminal.write(b"usage: gcloud <group> <command> [params]\r\n")
            return

        result = self.gcp.execute(args)

        if "error" in result:
            self.protocol.terminal.write(f"ERROR: {result['error']}\r\n".encode())
        else:
            import json
            self.protocol.terminal.write((json.dumps(result, indent=2) + "\r\n").encode())