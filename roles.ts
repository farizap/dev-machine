import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const caller = await aws.getCallerIdentity({});
const config = new pulumi.Config();

export const role = new aws.iam.Role("role", {
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
            Resource: `arn:aws:ssm:${config.get("aws:region")}:${
              caller.accountId
            }:parameter/dev_*`,
          },
          {
            Effect: "Allow",
            Action: ["ssm:DescribeParameters"],
            Resource: "*",
          },
        ],
      }),
    },
  ],
});
