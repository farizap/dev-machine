import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
// import * as awsx from "@pulumi/awsx"
import * as cloudflare from "@pulumi/cloudflare";
// import { devMachineRole } from "./roles";

const SPOT_PRICE = "0.03";
const AVAILABILITY_ZONE = "ap-southeast-1a";

// TODO: Maintain EFS creation in pulumi
const EFS_ID = "fs-0e667dd691652119e";
const EFS_MAIN_AP = "fsap-05c449dde05d0cf02";
const EFS_DOCKER_AP = "fsap-01613c64a6fd777cb";
const USER_DATA_URL =
  "https://raw.githubusercontent.com/farizap/dev-machine/master/scripts/user-data.sh";

const caller = await aws.getCallerIdentity({});
console.log(caller);
const config = new pulumi.Config();

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

const alphaMountTarget = new aws.efs.MountTarget("alphaMountTarget", {
  fileSystemId: EFS_ID,
  subnetId: subnet.id,
  securityGroups: [efssecurityGroup.id],
});

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

new aws.ssm.Parameter("dev_efs", {
  name: "dev_efs",
  type: "String",
  value: EFS_ID,
});

new aws.ssm.Parameter("dev_main_ap", {
  name: "dev_main_ap",
  type: "String",
  value: EFS_MAIN_AP,
});

new aws.ssm.Parameter("dev_docker_ap", {
  name: "dev_docker_ap",
  type: "String",
  value: EFS_DOCKER_AP,
});

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
    // Ubuntu
    // ami: "ami-07b575563ed0b0d0c",

    // Amazon Linux
    ami: "ami-0ed7f0f2fae2309cd",

    instanceType: "t4g.large",
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
  { dependsOn: [devMachineRole] }
);

cheapWorker.publicIp.apply((s) => pulumi.log.info("ip: " + s));

const record = new cloudflare.Record(
  "sample-record",
  {
    name: "dev-machine",
    zoneId: "ff21330beec903203ff7ed624d722d05",
    type: "A",
    value: cheapWorker.publicIp,
    ttl: 60,
    proxied: false,
  },
  { dependsOn: [cheapWorker] }
);
