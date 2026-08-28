# AWS CLI command emulation for Cowrie
# Place this in /cowrie/cowrie/commands/aws.py

import json
import random
import subprocess
import time
from datetime import datetime, timezone
from typing import Dict, List, Any
import urllib.request
import urllib.error


class AWSCommand:
    """Base class for AWS CLI commands"""

    # Define which commands we will handle via the cloud-api-mock service
    API_MOCK_ENDPOINTS = {
        ('ec2', 'describe-instances'): ('/aws/ec2/describe-instances', 'GET'),
        ('ec2', 'describe-volumes'): ('/aws/ec2/describe-volumes', 'GET'),
        ('ec2', 'describe-vpcs'): ('/aws/ec2/describe-vpcs', 'GET'),
        ('ec2', 'describe-subnets'): ('/aws/ec2/describe-subnets', 'GET'),
        ('ec2', 'describe-security-groups'): ('/aws/ec2/describe-security-groups', 'GET'),
        ('s3', 'ls'): ('/aws/s3/list-buckets', 'GET'),
        ('s3', 'list-buckets'): ('/aws/s3/list-buckets', 'GET'),
        ('iam', 'list-users'): ('/aws/iam/list-users', 'GET'),
        ('iam', 'list-roles'): ('/aws/iam/list-roles', 'GET'),
    }

    def __init__(self, session):
        self.session = session
        self.profile = "default"
        self.region = "us-east-1"
        self.output = "json"

    def _call_api_mock(self, endpoint, method='GET', body=None):
        """Make a request to the cloud-api-mock service"""
        try:
            # Use the Cowrie session ID for consistency
            session_id = getattr(self.session, 'id', 'unknown')
            url = f"http://cloud-api-mock:8080{endpoint}"
            headers = {
                "Content-Type": "application/json",
                "x-session-id": str(session_id)
            }
            data = None
            if body is not None:
                data = json.dumps(body).encode('utf-8')

            req = urllib.request.Request(url, data=data, headers=headers, method=method)

            with urllib.request.urlopen(req) as response:
                return json.loads(response.read().decode())
        except Exception as e:
            # If the API mock is unavailable, fall back to local implementation
            return None

    def get_fake_instances(self) -> List[Dict]:
        return [
            {
                "InstanceId": f"i-{''.join(random.choices('0123456789abcdef', k=17))}",
                "InstanceType": random.choice(["t3.micro", "t3.small", "t3.medium", "m5.large"]),
                "State": {"Name": random.choice(["running", "running", "running", "stopped"])},
                "PrivateIpAddress": f"10.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}",
                "PublicIpAddress": f"{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}" if random.random() > 0.3 else None,
                "VpcId": f"vpc-{''.join(random.choices('0123456789abcdef', k=17))}",
                "SubnetId": f"subnet-{''.join(random.choices('0123456789abcdef', k=17))}",
                "SecurityGroups": [{"GroupId": f"sg-{''.join(random.choices('0123456789abcdef', k=17))}", "GroupName": f"{self.naming_convention.format(env='prod', role='web', num=i+1)}"}],
                "Tags": [
                    {"Key": "Name", "Value": self.naming_convention.format(env="prod", role=random.choice(["web", "api", "db", "worker"]), num=i+1)},
                    {"Key": "Environment", "Value": "production"},
                    {"Key": "ManagedBy", "Value": "terraform"},
                ],
                "LaunchTime": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "Placement": {"AvailabilityZone": f"{self.region}{random.choice(['a','b','c'])}"},
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
                "Tags": [{"Key": "Role", "Value": role}],
            }
            for role in roles
        ]

    def get_fake_roles(self) -> List[Dict]:
        return [
            {
                "RoleName": f"{self.naming_convention.format(env='prod', role='ec2-role', num=1)}",
                "RoleId": f"AROA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                "Arn": f"arn:aws:iam::123456789012:role/ec2-role",
                "CreateDate": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "AssumeRolePolicyDocument": {
                    "Version": "2012-10-17",
                    "Statement": [{
                        "Effect": "Allow",
                        "Principal": {"Service": "ec2.amazonaws.com"},
                        "Action": "sts:AssumeRole"
                    }]
                },
            },
            {
                "RoleName": f"{self.naming_convention.format(env='prod', role='lambda-role', num=1)}",
                "RoleId": f"AROA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                "Arn": f"arn:aws:iam::123456789012:role/lambda-role",
                "CreateDate": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                "AssumeRolePolicyDocument": {
                    "Version": "2012-10-17",
                    "Statement": [{
                        "Effect": "Allow",
                        "Principal": {"Service": "lambda.amazonaws.com"},
                        "Action": "sts:AssumeRole"
                    }]
                },
            }
        ]

    def get_fake_access_keys(self) -> List[Dict]:
        return [
            {
                "AccessKeyId": f"AKIA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                "Status": "Active",
                "UserName": "admin"
            }
        ]

    def execute(self, args: List[str]) -> Dict[str, Any]:
        """Execute AWS CLI command"""
        # Handle version flag
        if "--version" in args or "-v" in args:
            return {"version": "aws-cli/2.15.0 Python/3.11.6 Linux/5.15.0-1057-aws exe/x86_64.ubuntu.22"}

        if len(args) < 2:
            return {"error": "usage: aws <service> <operation> [params]"}

        service = args[0]
        operation = args[1]

        # First, try to handle via cloud-api-mock for supported commands
        if (service, operation) in self.API_MOCK_ENDPOINTS:
            endpoint, method = self.API_MOCK_ENDPOINTS[(service, operation)]
            result = self._call_api_mock(endpoint, method)
            if result is not None:
                return result
            # If API mock fails, fall back to local implementation below

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
                return {"Vpcs": [{"VpcId": f"vpc-{''.join(random.choices('0123456789abcdef', k=17))}", "CidrBlock": f"10.{random.randint(0,255)}.0.0/16", "State": "available", "IsDefault": False}]}
            elif operation == "describe-subnets":
                return {"Subnets": [{"SubnetId": f"subnet-{''.join(random.choices('0123456789abcdef', k=17))}", "VpcId": f"vpc-{''.join(random.choices('0123456789abcdef', k=17))}", "CidrBlock": f"10.{random.randint(0,255)}.{random.randint(0,255)}.0/24", "AvailabilityZone": f"{self.region}{random.choice(['a','b','c'])}", "State": "available", "AvailableIpAddressCount": random.randint(100, 250)} for _ in range(6)]}
            elif operation == "describe-security-groups":
                return {"SecurityGroups": [{"GroupId": f"sg-{''.join(random.choices('0123456789abcdef', k=17))}", "GroupName": f"default", "Description": "Default security group", "VpcId": f"vpc-{''.join(random.choices('0123456789abcdef', k=17))}"}]}
            elif operation == "run-instances":
                return {"Instances": [self.get_fake_instances()[0]]}
            elif operation == "terminate-instances":
                instance_id = args[args.index("--instance-ids")+1] if "--instance-ids" in args else "i-12345678"
                return {"TerminatingInstances": [{"InstanceId": instance_id, "CurrentState": {"Name": "shutting-down"}}]}

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
                return {"Roles": self.get_fake_roles()}
            elif operation == "list-access-keys":
                return {"AccessKeyMetadata": self.get_fake_access_keys()}
            elif operation == "create-access-key":
                return {"AccessKey": {
                    "AccessKeyId": f"AKIA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                    "SecretAccessKey": f"{''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+', k=40))}",
                    "Status": "Active"
                }}

        # STS commands
        elif service == "sts":
            if operation == "get-caller-identity":
                return {"Account": "123456789012", "UserId": f"AIDA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}", "Arn": f"arn:aws:iam::123456789012:user/admin"}
            elif operation == "assume-role":
                # Parse arguments for role ARN and session name
                role_arn = ""
                role_session_name = "honeypot-session"
                i = 0
                while i < len(args):
                    if args[i] == "--role-arn" and i+1 < len(args):
                        role_arn = args[i+1]
                        i += 2
                    elif args[i] == "--role-session-name" and i+1 < len(args):
                        role_session_name = args[i+1]
                        i += 2
                    else:
                        i += 1
                if not role_arn:
                    role_arn = f"arn:aws:iam::123456789012:role/EC2Role"
                return {
                    "Credentials": {
                        "AccessKeyId": f"ASIA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}",
                        "SecretAccessKey": f"{''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/+', k=40))}",
                        "SessionToken": f"IQoJb3JpZ2luX2VjE...{''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=200))}",
                        "Expiration": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
                    },
                    "AssumedRoleUser": {
                        "AssumedRoleId": f"AROA{''.join(random.choices('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=16))}:{role_session_name}",
                        "Arn": role_arn
                    },
                    "PackedPolicySize": 0
                }

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