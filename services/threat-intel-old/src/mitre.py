"""MITRE ATT&CK Cloud Technique Definitions"""

MITRE_CLOUD_TECHNIQUES = {
    "T1526": {
        "name": "Cloud Service Discovery",
        "tactic": "Discovery",
        "triggers": [
            "aws ec2 describe",
            "aws s3 ls",
            "aws iam list",
            "aws rds describe",
            "aws lambda list",
            "az vm list",
            "az storage account list",
            "az ad user list",
            "gcloud compute instances list",
            "gsutil ls",
            "gcloud iam service-accounts list"
        ],
        "severity": "low"
    },
    "T1530": {
        "name": "Cloud Storage Object Discovery",
        "tactic": "Discovery",
        "triggers": [
            "aws s3 ls",
            "aws s3api list-objects",
            "az storage blob list",
            "gsutil ls",
            "gcloud storage ls"
        ],
        "severity": "low"
    },
    "T1082": {
        "name": "System Information Discovery",
        "tactic": "Discovery",
        "triggers": [
            "uname -a",
            "cat /etc/os-release",
            "lscpu",
            "free -h",
            "df -h",
            "whoami",
            "id"
        ],
        "severity": "low"
    },
    "T1069.003": {
        "name": "Permission Groups Discovery: Cloud Groups",
        "tactic": "Discovery",
        "triggers": [
            "aws iam list-groups",
            "aws iam get-group",
            "az ad group list",
            "gcloud iam groups list"
        ],
        "severity": "medium"
    },
    "T1083": {
        "name": "File and Directory Discovery",
        "tactic": "Discovery",
        "triggers": [
            "ls -la",
            "find / -name",
            "locate",
            "cat /etc/passwd",
            "cat /etc/shadow"
        ],
        "severity": "low"
    },
    "T1550.007": {
        "name": "Use Alternate Authentication Material: Cloud Token",
        "tactic": "Lateral Movement",
        "triggers": [
            "AWS_SESSION_TOKEN",
            "AZURE_TOKEN",
            "gcloud auth",
            "aws sts assume-role",
            "az account get-access-token"
        ],
        "severity": "critical"
    },
    "T1098": {
        "name": "Account Manipulation",
        "tactic": "Persistence",
        "triggers": [
            "aws iam create-user",
            "aws iam attach-user-policy",
            "aws iam put-user-policy",
            "aws iam create-access-key",
            "az ad user create",
            "az role assignment create",
            "gcloud iam service-accounts create",
            "gcloud projects add-iam-policy-binding"
        ],
        "severity": "high"
    },
    "T1505.003": {
        "name": "Server Software Component: Web Shell",
        "tactic": "Persistence",
        "triggers": [
            "wget http",
            "curl http",
            "php -S",
            "python -m http.server",
            "nc -l"
        ],
        "severity": "high"
    },
    "T1078.004": {
        "name": "Valid Accounts: Cloud Accounts",
        "tactic": "Initial Access",
        "triggers": [
            "aws configure",
            "az login",
            "gcloud auth login",
            "aws sts get-caller-identity"
        ],
        "severity": "critical"
    },
    "T1556.003": {
        "name": "Modify Authentication Process: Cloud Credentials",
        "tactic": "Credential Access",
        "triggers": [
            "cat ~/.aws/credentials",
            "cat ~/.azure/",
            "cat ~/.config/gcloud/",
            "env | grep -i aws",
            "env | grep -i az",
            "env | grep -i gcp"
        ],
        "severity": "critical"
    },
    "T1528": {
        "name": "Steal Application Access Token",
        "tactic": "Credential Access",
        "triggers": [
            "cat ~/.git-credentials",
            "cat ~/.npmrc",
            "cat ~/.docker/config.json",
            "kubectl config view"
        ],
        "severity": "critical"
    },
    "T1048": {
        "name": "Exfiltration Over Alternative Protocol",
        "tactic": "Exfiltration",
        "triggers": [
            "aws s3 cp",
            "aws s3 sync",
            "az storage blob download",
            "az storage blob upload",
            "gsutil cp",
            "gsutil rsync"
        ],
        "severity": "high"
    },
    "T1110.003": {
        "name": "Brute Force: Password Spraying",
        "tactic": "Credential Access",
        "triggers": [
            "hydra",
            "medusa",
            "ncrack",
            "sshpass",
            "for i in"
        ],
        "severity": "high"
    },
    "T1546.001": {
        "name": "Event Triggered Execution: Change Default File Association",
        "tactic": "Persistence",
        "triggers": [
            "crontab -e",
            "systemctl enable",
            "rc.local",
            ".bashrc",
            ".profile"
        ],
        "severity": "medium"
    },
    "T1021.004": {
        "name": "Remote Services: SSH",
        "tactic": "Lateral Movement",
        "triggers": [
            "ssh ",
            "scp ",
            "ssh-keygen",
            "ssh-copy-id",
            "aws ssm start-session",
            "az vm run-command invoke",
            "gcloud compute ssh"
        ],
        "severity": "high"
    },
    "T1586.002": {
        "name": "Compromise Accounts: Email Accounts",
        "tactic": "Resource Development",
        "triggers": [
            "aws ses",
            "az communication",
            "gcloud email"
        ],
        "severity": "medium"
    },
    "T1608.001": {
        "name": "Stage Capabilities: Upload Malware",
        "tactic": "Resource Development",
        "triggers": [
            "wget ",
            "curl -O",
            "curl -L",
            "scp ",
            "aws s3 cp.*\\.sh",
            "aws s3 cp.*\\.py"
        ],
        "severity": "high"
    }
}