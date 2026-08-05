# Azure CLI command emulation for Cowrie

import json
import random
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Any


class AzureCommand:
    """Azure CLI command emulator"""

    def __init__(self, session):
        self.session = session
        self.subscription_id = f"sub-{''.join(random.choices('0123456789abcdef', k=32))}"

    def get_fake_vms(self) -> List[Dict]:
        vm_sizes = ["Standard_D2s_v3", "Standard_D4s_v3", "Standard_E4s_v3", "Standard_B2s"]
        return [
            {
                "id": f"/subscriptions/{self.subscription_id}/resourceGroups/rg-prod/providers/Microsoft.Compute/virtualMachines/vm-{i}",
                "name": f"vm-{random.choice(['web', 'api', 'db', 'worker'])}-{i:03d}",
                "type": "Microsoft.Compute/virtualMachines",
                "location": random.choice(["eastus", "westus2", "centralus"]),
                "properties": {
                    "hardwareProfile": {"vmSize": random.choice(vm_sizes)},
                    "storageProfile": {
                        "osDisk": {"osType": "Linux", "createOption": "FromImage"},
                        "imageReference": {
                            "publisher": "Canonical",
                            "offer": "UbuntuServer",
                            "sku": "18.04-LTS",
                            "version": "latest"
                        }
                    },
                    "networkProfile": {
                        "networkInterfaces": [
                            {"id": f"/subscriptions/{self.subscription_id}/resourceGroups/rg-prod/providers/Microsoft.Network/networkInterfaces/nic-{i}"}
                        ]
                    },
                    "provisioningState": "Succeeded"
                },
                "tags": {"Environment": "Production", "Application": "core-platform"}
            }
            for i in range(random.randint(3, 7))
        ]

    def get_fake_storage(self) -> List[Dict]:
        return [
            {
                "id": f"/subscriptions/{self.subscription_id}/resourceGroups/rg-prod/providers/Microsoft.Storage/storageAccounts/st{''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=16))}",
                "name": f"st{''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=16))}",
                "type": "Microsoft.Storage/storageAccounts",
                "location": "eastus",
                "sku": {"name": "Standard_LRS", "tier": "Standard"},
                "kind": "StorageV2",
                "properties": {
                    "accessTier": "Hot",
                    "supportsHttpsTrafficOnly": True,
                    "encryption": {"services": {"blob": {"enabled": True}, "file": {"enabled": True}}}
                }
            }
            for _ in range(random.randint(2, 5))
        ]

    def execute(self, args: List[str]) -> Dict[str, Any]:
        if len(args) < 1:
            return {"error": "usage: az <group> <command> [params]"}

        group = args[0]

        if group == "vm" and len(args) > 1:
            cmd = args[1]
            if cmd == "list":
                return self.get_fake_vms()
            elif cmd == "show":
                return self.get_fake_vms()[0]

        elif group == "storage" and len(args) > 1:
            cmd = args[1]
            if cmd == "account" and len(args) > 2 and args[2] == "list":
                return self.get_fake_storage()

        elif group == "ad" and len(args) > 1:
            cmd = args[1]
            if cmd == "user" and len(args) > 2 and args[2] == "list":
                return {
                    "value": [
                        {
                            "id": str(uuid.uuid4()),
                            "userPrincipalName": f"admin@company.onmicrosoft.com",
                            "displayName": "Admin User",
                            "mail": "admin@company.com"
                        },
                        {
                            "id": str(uuid.uuid4()),
                            "userPrincipalName": f"ci-cd@company.onmicrosoft.com",
                            "displayName": "CI/CD Service Account",
                            "mail": None
                        }
                    ]
                }

        elif group == "group" and len(args) > 1 and args[1] == "list":
            return [{"name": "rg-prod", "location": "eastus"}, {"name": "rg-dev", "location": "westus2"}]

        elif group == "account" and len(args) > 1 and args[1] == "show":
            return {
                "id": self.subscription_id,
                "name": "Production Subscription",
                "state": "Enabled",
                "tenantId": str(uuid.uuid4())
            }

        return {"error": f"Unknown command: {' '.join(args)}"}


class CommandAZ:
    """Cowrie command wrapper for Azure CLI"""

    def __init__(self, protocol):
        self.protocol = protocol
        self.azure = AzureCommand(protocol)

    def call(self, args):
        if len(args) < 1:
            self.protocol.terminal.write(b"usage: az <group> <command> [params]\r\n")
            return

        result = self.azure.execute(args)

        if "error" in result:
            self.protocol.terminal.write(f"ERROR: {result['error']}\r\n".encode())
        else:
            import json
            self.protocol.terminal.write((json.dumps(result, indent=2) + "\r\n").encode())