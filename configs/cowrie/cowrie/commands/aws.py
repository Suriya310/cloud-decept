# AWS CLI command emulation for Cowrie
# Place this in /cowrie/cowrie/commands/aws.py

import json
import random
import subprocess
import time
from datetime import datetime, timezone
from typing import Dict, List, Any


class AWSCommand:
    """Base class for AWS CLI commands"""

    def __init__(self, session):
        self.session = session
        self.profile = "default"
        self.region = "us-east-1"
        self.output = "json"

    def get_fake_instances(self) -> List[Dict]:
        return [
            {
                "InstanceId": f"i-{''.join(random.choices('0123456789abcdef', k=17))}",
                "InstanceType": random.choice(["t3.micro", "t3.small", "t3.medium", "m5.large"]),
                "State": {"Name": "running"},
                "PrivateIpAddress": f"10.0.{random.randint(1,255)}.{random.randint(1,255)}",
                "PublicIpAddress": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}",
                "VpcId": f"vpc-{''.join(random.choices('0123456789abcdef', k=17))}",
                "SubnetId": f"subnet-{''.join(random.choices('0123456789abcdef', k=17))}",
                "SecurityGroups": [
                    {"GroupId": f"sg-{''.join(random.choices('0123456789abcdef', k=17))}", "GroupName": "default"}
                ],
                "Tags": [
                    {"Key": "Name", "Value": random.choice(["web-server", "api-gateway", "database", "worker"])},
                    {"Key": "Environment", "Value": "production"}
                ],
                "LaunchTime": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "Placement": {"AvailabilityZone": f"us-east-1{random.choice(['a','b','c'])}"},
                "Architecture": "x86_64",
                "RootDeviceType": "ebs",
                "VirtualizationType": "hvm"
            }
            for _ in range(random.randint(3, 8))
        ]

    def get_fake_buckets(self) -> List[Dict]:
        return [
            {"Name": f"company-{name}", "CreationDate": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")}
            for name in ["data-lake", "logs", "backups", "assets", "ml-models", "terraform-state"]
        ]

    def get_fake_users(self) -> List[Dict]:
        roles = ["admin", "developer", "ci-cd", "monitoring", "backup"]
        return [
            {
                "UserName": role,
                "UserId": f"AIDA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                "Arn": f"arn:aws:iam::123456789012:user/{role}",
                "CreateDate": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "PasswordLastUsed": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") if random.random() > 0.2 else None,
            }
            for role in roles
        ]

    def execute(self, args: List[str]) -> Dict[str, Any]:
        """Execute AWS CLI command"""
        if len(args) < 2:
            return {"error": "usage: aws <service> <operation> [params]"}

        service = args[0]
        operation = args[1]

        # EC2 commands
        if service == "ec2":
            if operation == "describe-instances":
                return {"Reservations": [{"Instances": self.get_fake_instances()}]}
            elif operation == "describe-volumes":
                return {"Volumes": [
                    {"VolumeId": f"vol-{''.join(random.choices('0123456789abcdef', k=17))}", "Size": random.choice([20, 50, 100, 200]), "VolumeType": "gp3", "State": "available"}
                    for _ in range(5)
                ]}
            elif operation == "describe-vpcs":
                return {"Vpcs": [{"VpcId": "vpc-12345678", "CidrBlock": "10.0.0.0/16", "State": "available"}]}
            elif operation == "describe-subnets":
                return {"Subnets": [{"SubnetId": f"subnet-{''.join(random.choices('0123456789abcdef', k=17))}", "VpcId": "vpc-12345678", "CidrBlock": f"10.0.{i}.0/24", "AvailabilityZone": f"us-east-1{az}"}
                                for i, az in enumerate(['a', 'b', 'c'])]}
            elif operation == "describe-security-groups":
                return {"SecurityGroups": [{"GroupId": "sg-12345678", "GroupName": "default", "Description": "Default security group", "VpcId": "vpc-12345678"}]}
            elif operation == "run-instances":
                return {"Instances": [self.get_fake_instances()[0]]}
            elif operation == "terminate-instances":
                return {"TerminatingInstances": [{"InstanceId": args[args.index("--instance-ids")+1] if "--instance-ids" in args else "i-12345678", "CurrentState": {"Name": "shutting-down"}}]}

        # S3 commands
        elif service == "s3":
            if operation == "ls" or operation == "list-buckets":
                return {"Buckets": self.get_fake_buckets()}
            elif operation == "cp":
                return {"ETag": f"\"{''.join(random.choices('0123456789abcdef', k=32))}\""}

        # IAM commands
        elif service == "iam":
            if operation == "list-users":
                return {"Users": self.get_fake_users()}
            elif operation == "list-roles":
                return {"Roles": [
                    {"RoleName": "EC2Role", "Arn": "arn:aws:iam::123456789012:role/EC2Role"},
                    {"RoleName": "LambdaRole", "Arn": "arn:aws:iam::123456789012:role/LambdaRole"},
                ]}
            elif operation == "list-access-keys":
                return {"AccessKeyMetadata": [
                    {"AccessKeyId": f"AKIA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}", "Status": "Active", "UserName": "admin"}
                ]}
            elif operation == "create-access-key":
                return {"AccessKey": {
                    "AccessKeyId": f"AKIA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                    "SecretAccessKey": f"{''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+', k=40))}",
                    "Status": "Active"
                }}

        # STS commands
        elif service == "sts":
            if operation == "get-caller-identity":
                return {"Account": "123456789012", "UserId": "AIDA12345678901234567", "Arn": "arn:aws:iam::123456789012:user/admin"}
            elif operation == "assume-role":
                return {"Credentials": {
                    "AccessKeyId": f"ASIA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                    "SecretAccessKey": f"{''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+', k=40))}",
                    "SessionToken": f"IQoJb3JpZ2luX2VjE...{''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=200))}",
                    "Expiration": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                }}

        return {"error": f"Unknown service/operation: {service} {operation}"}


# For direct Cowrie integration
class CommandAWS:
    """Cowrie command wrapper for AWS CLI"""

    def __init__(self, protocol):
        self.protocol = protocol
        self.aws = AWSCommand(protocol)

    def call(self, args):
        """Handle aws command"""
        if len(args) < 1:
            self.protocol.terminal.write(b"usage: aws <service> <operation> [params]\r\n")
            return

        # Remove 'aws' from args
        result = self.aws.execute(args)

        if "error" in result:
            self.protocol.terminal.write(f"Error: {result['error']}\r\n".encode())
        else:
            self.protocol.terminal.write((json.dumps(result, indent=2) + "\r\n").encode())