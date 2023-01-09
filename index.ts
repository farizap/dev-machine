import * as pulumi from "@pulumi/pulumi";

import * as aws from "@pulumi/aws";
// import * as awsx from "@pulumi/awsx"
import * as cloudflare from "@pulumi/cloudflare";
// import { devMachineRole } from "./roles";

import "dotenv/config";

const SPOT_PRICE = "0.1";
const AVAILABILITY_ZONE = "ap-southeast-1a";

// TODO: Maintain EFS creation in pulumi
// TODO: Use static IP instead of cloudflare
const USER_DATA_URL =
  "https://raw.githubusercontent.com/farizap/dev-machine/master/scripts/user-data.sh";

const caller = await aws.getCallerIdentity({});

const efs = new aws.efs.FileSystem("dev-machine", undefined, {
  retainOnDelete: true,
});

const efsDataAP = new aws.efs.AccessPoint(
  "dataAP",
  {
    fileSystemId: efs.id,
    rootDirectory: {
      creationInfo: {
        ownerGid: 1000,
        ownerUid: 1000,
        permissions: "0755",
      },
      path: "/data",
    },
    posixUser: { gid: 1000, uid: 1000 },
  },
  { retainOnDelete: true, dependsOn: [efs] }
);
const efsDockerAP = new aws.efs.AccessPoint(
  "dockerAP",
  {
    fileSystemId: efs.id,
    rootDirectory: {
      creationInfo: {
        ownerGid: 0,
        ownerUid: 0,
        permissions: "0755",
      },
      path: "/docker",
    },
    posixUser: { gid: 0, uid: 0 },
  },
  { retainOnDelete: true, dependsOn: [efs] }
);

export const role = new aws.iam.Role("role", {
  name: "role",
  path: "/",
  assumeRolePolicy: JSON.stringify({
    Version: "2012-10-17",
    Statement: [
      {
        Action: "sts:AssumeRole",
        Principal: {
          Service: "ec2.amazonaws.com",
        },
        Effect: "Allow",
      },
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          AWS: caller.arn,
        },
      },
    ],
  }),
  inlinePolicies: [
    {
      name: "dev_ssm_access",
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: [
              "ssm:PutParameter",
              "ssm:DeleteParameter",
              "ssm:GetParameterHistory",
              "ssm:GetParametersByPath",
              "ssm:GetParameters",
              "ssm:GetParameter",
              "ssm:DeleteParameters",
            ],
            Effect: "Allow",
            Resource: "*",
          },
        ],
      }),
    },
  ],
});

export const devMachineRole = new aws.iam.Role("dev_machine_role", {
  name: "EC2DevMachineRole",
  assumeRolePolicy: {
    Version: "2012-10-17",

    Statement: [
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          Service: "ec2.amazonaws.com",
        },
      },
      {
        Action: "sts:AssumeRole",
        Effect: "Allow",
        Principal: {
          AWS: caller.arn,
        },
      },
    ],
  },
  inlinePolicies: [
    {
      name: "dev_ssm_access",
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: [
              "ssm:PutParameter",
              "ssm:DeleteParameter",
              "ssm:GetParameterHistory",
              "ssm:GetParametersByPath",
              "ssm:GetParameters",
              "ssm:GetParameter",
              "ssm:DeleteParameters",
            ],
            Resource: "*",
          },
          {
            Effect: "Allow",
            Action: ["ssm:DescribeParameters"],
            Resource: "*",
          },
        ],
      }),
    },
    {
      name: "elasticFileSystemAccess",
      policy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Action: ["elasticfilesystem:DescribeMountTargets"],
            Resource: "*",
          },
        ],
      }),
    },
  ],
});

const vpc = new aws.ec2.DefaultVpc("vpc");
const subnet = new aws.ec2.DefaultSubnet("alphaSubnet", {
  availabilityZone: AVAILABILITY_ZONE,
  // cidrBlock: "10.0.1.0/24",
});

const securityGroup = new aws.ec2.SecurityGroup("mysecuritygroup", {
  vpcId: vpc.id,
  ingress: [
    { protocol: "tcp", fromPort: 22, toPort: 22, cidrBlocks: ["0.0.0.0/0"] },
  ],
  egress: [
    {
      protocol: "all",
      fromPort: 0,
      toPort: 0,
      self: true,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const efssecurityGroup = new aws.ec2.SecurityGroup("efssecuritygroup", {
  vpcId: vpc.id,
  ingress: [
    {
      protocol: "tcp",
      fromPort: 2049,
      toPort: 2049,
      securityGroups: [securityGroup.id],
    },
  ],
  egress: [
    {
      protocol: "all",
      fromPort: 0,
      toPort: 0,
      self: true,
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const alphaMountTarget = new aws.efs.MountTarget(
  "alphaMountTarget",
  {
    fileSystemId: efs.id,
    subnetId: subnet.id,
    securityGroups: [efssecurityGroup.id],
  },
  { dependsOn: [efs] }
);

const sshKey = new aws.ec2.KeyPair("dev", {
  publicKey:
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCx9ZnzhJP5eil23TMy6VaSJRg3Sr8smKCS/GPRjR0jm+VkJGsoOMZF9n4RALUQewbMy+TYfNqynlJn24w1wDDEsF51b+zUaTUkmgXwoDekTFzz20QD1ZasyEKrEj9UzNRLwv6M+3pKTZUf6zGVkIWsRaDuxMVM9C/gCPS1kxmX+ePn9oXnCw7MOY4Ot7UqbkQSlY3vH0bLTfnW4DplvdkL/mTjJCufUpubtns0+aQupGGs5N0dcmC/lOTpXP9kimnauks6M9bs01WYwMit4S9xctnP2LhPooqtfau1YwoOrCFJs8EYAXUytZm7MPEsoKmbZaE2s2TJ7lypsn66NnLeXIl91yVvDP8GJH38om0SYfTKHfcY+Y114vAgwdZHIJK2JcJPEtxqIlpFrV7ZcoI2R5KGcBlWCK/th3iuui+v5GcB8Bcz+cqZQQAMyiFQSYQa2JIy3klt+S9w9LoNgDz0c8LT0+hzemDVnwTTpk6iRbULDBsAowqZyFV/UgTuHK8= farizapr@protonmail.com",
});

new aws.ssm.Parameter("dev_ssh_key", {
  name: "dev_ssh_key",
  type: "String",
  value: sshKey.publicKey,
});

new aws.ssm.Parameter("az", {
  name: "az",
  type: "String",
  value: AVAILABILITY_ZONE,
});

new aws.ssm.Parameter(
  "dev_efs",
  {
    name: "dev_efs",
    type: "String",
    value: efs.id,
  },
  { dependsOn: [efs] }
);

new aws.ssm.Parameter(
  "dev_main_ap",
  {
    name: "dev_main_ap",
    type: "String",
    value: efsDataAP.id,
  },
  { dependsOn: [efsDataAP] }
);

new aws.ssm.Parameter(
  "dev_docker_ap",
  {
    name: "dev_docker_ap",
    type: "String",
    value: efsDockerAP.id,
  },
  { dependsOn: [efsDockerAP] }
);

const userData = `#!/bin/sh
curl -L -s ${USER_DATA_URL} | bash`;

const instanceProfile = new aws.iam.InstanceProfile(
  "dev_ec2_profile",
  {
    role: devMachineRole,
    name: "dev_ec2_profile",
  },
  { dependsOn: [devMachineRole] }
);

// Request a spot instance at $0.03
const cheapWorker = new aws.ec2.SpotInstanceRequest(
  "cheap_worker",
  {
    // Ubuntu (ARM)
    // ami: "ami-06ecd61e4bded3bfe",

    // Amazon Linux (AMD64)
    // ami: "ami-0af2f764c580cc1f9",
    ami: "ami-005835d578c62050d",

    // Amazon Linux (ARM)
    // ami: "ami-0ed7f0f2fae2309cd",

    // instanceType: "t4g.nano",
    // instanceType: "t3.medium",
    instanceType: "t3.large",
    // instanceType: "t4g.medium",
    // instanceType: "t4g.large",

    spotPrice: SPOT_PRICE,
    tags: {
      Name: "CheapWorker",
    },
    instanceInterruptionBehavior: "terminate",
    waitForFulfillment: true,
    keyName: sshKey.id,
    subnetId: subnet.id,
    userData,
    // securityGroups: [securityGroup.id],
    vpcSecurityGroupIds: [securityGroup.id],
    iamInstanceProfile: instanceProfile.name,
  },
  { dependsOn: [devMachineRole, alphaMountTarget, efsDataAP, efsDockerAP] }
);

const eip = new aws.ec2.Eip("eip", {
  vpc: true,
});

const eipAssoc = new aws.ec2.EipAssociation("eipassoc", {
  instanceId: cheapWorker.spotInstanceId,
  allocationId: eip.id,
});

cheapWorker.publicIp.apply((s) => pulumi.log.info("ip: " + s));
eip.publicIp.apply((s) => pulumi.log.info("eip: " + s));

const cf = new cloudflare.Provider("cf", {
  apiToken: process.env.CLOUDFLARE_API_TOKEN,
});
const record = new cloudflare.Record(
  "sample-record",
  {
    name: "dev-machine",
    zoneId: "ff21330beec903203ff7ed624d722d05",
    type: "A",
    value: eip.publicIp,
    ttl: 60,
    proxied: false,
  },
  { dependsOn: [eip], provider: cf }
);