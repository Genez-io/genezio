import fs from "fs";
import { ClassConfiguration, ProjectConfiguration } from "../models/projectConfiguration";
import { CloudAdapter, GenezioCloudInput, GenezioCloudOutput } from "./cloudAdapter";
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand, CreateStackCommandInput, UpdateStackCommand, UpdateStackCommandOutput, DescribeStacksCommandOutput, waitUntilStackCreateComplete, waitUntilStackUpdateComplete } from "@aws-sdk/client-cloudformation";
import { CreateBucketCommand, HeadObjectCommand, PutBucketVersioningCommand, PutObjectCommand, S3, S3Client } from "@aws-sdk/client-s3";
import { debugLogger } from "../utils/logging";
import log from "loglevel";


export class SelfHostedAwsAdapter implements CloudAdapter {
  getS3CloudFormationTemplate(bucketName: string, bucketResourceName: string, projectName: string) {
    return `{
            "AWSTemplateFormatVersion": "2010-09-09",
            "Resources": {
              "${bucketResourceName}": {
                "Type": "AWS::S3::Bucket",
                "Properties": {
                  "BucketName": "${bucketName}",
                  "AccessControl": "Private",
                  "VersioningConfiguration": {
                    "Status": "Enabled"
                  }
                }
              }
            },
          }`
  }

  getCloudFormationTemplate(bucketName: string, bucketKey: string, runtime: string, bucketResource: string, fileVersion: string, projectName: string, className: string, region: string) {
    const functionResource = `Genezio${alphanumericString(projectName)}${alphanumericString(className)}`
    const functionName = `genezio-${alphanumericString(projectName)}-${region}-${alphanumericString(className)}`
    const apiGatewayResource = `Genezio${alphanumericString(projectName)}${alphanumericString(className)}ApiGateway`
    const apiGatewayName = `genezio-${alphanumericString(projectName)}-${alphanumericString(className)}`

    return `{
      "AWSTemplateFormatVersion": "2010-09-09",
      "Resources": {
        "${bucketResource}": {
          "Type": "AWS::S3::Bucket",
          "Properties": {
              "BucketName": "${bucketName}",
              "AccessControl": "Private",
              "VersioningConfiguration": {
                  "Status": "Enabled"
              }
          }
        },
        "${functionResource}": {
          "Type": "AWS::Lambda::Function",
          "Properties": {
            "FunctionName": "${functionName}",
            "Handler": "index.handler",
            "Architectures": ["arm64"],
            "Runtime": "${runtime}",
            "Role": {
              "Fn::GetAtt": ["LambdaExecutionRole", "Arn"]
            },
            "Code": {
              "S3Bucket": "${bucketName}",
              "S3Key": "${bucketKey}",
              "S3ObjectVersion": "${fileVersion}"
            },
            "MemorySize": 1024,
            "Timeout": 10
          }
        },
        "LambdaExecutionRole": {
          "Type": "AWS::IAM::Role",
          "Properties": {
            "AssumeRolePolicyDocument": {
              "Version": "2012-10-17",
              "Statement": [
                {
                  "Effect": "Allow",
                  "Principal": {
                    "Service": ["lambda.amazonaws.com"]
                  },
                  "Action": ["sts:AssumeRole"]
                }
              ]
            },
            "Policies": [
              {
                "PolicyName": "LambdaExecutionPolicy",
                "PolicyDocument": {
                  "Version": "2012-10-17",
                  "Statement": [
                    {
                      "Effect": "Allow",
                      "Action": ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
                      "Resource": "arn:aws:logs:*:*:*"
                    }
                  ]
                }
              }
            ]
          }
        },
        "${apiGatewayResource}": {
          "Type": "AWS::ApiGatewayV2::Api",
          "Properties": {
            "Name": "${apiGatewayResource}",
            "ProtocolType": "HTTP",
            "Description": "API Gateway for Genezio Project ${projectName}}"
          }
        },
        "${apiGatewayResource}Integration": {
            "Type": "AWS::ApiGatewayV2::Integration",
            "Properties": {
                "ApiId": { "Ref": "${apiGatewayResource}" },
                "IntegrationType": "AWS_PROXY",
                "PayloadFormatVersion": "2.0",
                  "IntegrationUri": { "Fn::Join": [
                      "",
                      [
                          "arn:",
                          {
                              "Ref": "AWS::Partition"
                          },
                          ":apigateway:",
                          {
                              "Ref": "AWS::Region"
                          },
                          ":lambda:path/2015-03-31/functions/",
                          {
                              "Fn::GetAtt": [
                                "${functionResource}",
                                  "Arn"
                              ]
                          },
                          "/invocations"
                      ]
                  ]
        }
      }
    },
        "${apiGatewayResource}Route": {
          "Type": "AWS::ApiGatewayV2::Route",
          "Properties": {
            "ApiId": { "Ref": "${apiGatewayResource}" },
            "RouteKey": "$default",
            "Target": {
              "Fn::Join": [
                "/",
                [
                  "integrations",
                  {
                    "Ref": "${apiGatewayResource}Integration"
                  }
                ]
              ]
            }
          }
        },
        "ApiDeployment": {
          "Type": "AWS::ApiGatewayV2::Deployment",
          "DependsOn": ["${apiGatewayResource}ProdStage", "${apiGatewayResource}Route", "${apiGatewayResource}Integration"],
          "Properties": {
            "ApiId": {
              "Ref": "${apiGatewayResource}"
            },
            "StageName": "prod"
          }
        },
        "${apiGatewayResource}ProdStage": {
          "Type" : "AWS::ApiGatewayV2::Stage",
          "Properties" : {
              "ApiId" : {
                "Ref": "${apiGatewayResource}"
              },
              "StageName" : "prod"
            }
        },
        "LambdaInvokePermission": {
          "Type": "AWS::Lambda::Permission",
          "Properties": {
            "Action": "lambda:InvokeFunction",
            "FunctionName": {
              "Fn::GetAtt": ["${functionResource}", "Arn"]
            },
            "Principal": "apigateway.amazonaws.com",
            "SourceArn": {
              "Fn::Join": [
                "",
                [
                  "arn:aws:execute-api:",
                  {
                    "Ref": "AWS::Region"
                  },
                  ":",
                  {
                    "Ref": "AWS::AccountId"
                  },
                  ":",
                  {
                    "Ref": "${apiGatewayResource}"
                  },
                  "/*"
                ]
              ]
            }
          }
        }
      },
      "Outputs": {
        "ApiUrl": {
          "Description": "The URL of the API Gateway",
          "Value": {
            "Fn::Join": [
              "",
              [
                "https://",
                {
                  "Ref": "${apiGatewayResource}"
                },
                ".execute-api.",
                {
                  "Ref": "AWS::Region"
                },
                ".amazonaws.com/prod/"
              ]
            ]
          }
        }
      }
    }`;
  }

  async getLatestObjectVersion(cliet: S3, bucket: string, key: string): Promise<string | undefined> {
    const result = await cliet.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }));

    return result.VersionId;
  }

  async #checkIfStackExists(client: CloudFormationClient, stackName: string): Promise<boolean> {
    return await client.send(new DescribeStacksCommand({
      StackName: stackName,
    }))
    .then((stack) => {
     return true;
    })
    .catch((e) => {
      if (e.message === "Stack with id " + stackName + " does not exist") {
        return false;
      }

      throw e
    })
  }

  async #uploadZipToS3(client: S3, bucket: string, key: string, path: string): Promise<void> {
    const content = fs.readFileSync(path);

    await client.send(new PutObjectCommand({
      Body: content,
      Bucket: bucket,
      Key: key,
    }));
  }

  #getFunctionRuntime(language: string): string {
    switch (language) {
      case ".js":
      case ".ts":
        return "nodejs14.x";
      case ".dart":
        return "provided.al2";
      default:
        throw new Error("Unsupported language: " + language);
    }
  }

  async #initializeStack(client: CloudFormationClient, stackName: string, bucketName: string, bucketResourceName: string, projectName: string): Promise<void> {
    const template = this.getS3CloudFormationTemplate(bucketName, bucketResourceName, projectName);
    await client.send(new CreateStackCommand({
      StackName: stackName,
      TemplateBody: template,
    }));

    await waitUntilStackCreateComplete({
      client: client,
      maxWaitTime: 360,
    }, {
      StackName: stackName,
    });
  }

  async #updateStack(s3Client: S3, cloudFormationClient: CloudFormationClient, stackName: string, bucketName: string, bucketKey: string, bucketResourceName: string, projectConfiguration: ProjectConfiguration, inputItem: GenezioCloudInput, classConfiguration: ClassConfiguration | undefined) {
    const version = await this.getLatestObjectVersion(s3Client, bucketName, bucketKey);

    if (!version) {
      throw new Error("Cannot get latest object version");
    }

    const createStackTemplate = this.getCloudFormationTemplate(
      bucketName,
      bucketKey,
      this.#getFunctionRuntime(classConfiguration!.language),
      bucketResourceName,
      version,
      projectConfiguration.name,
      inputItem.name,
      projectConfiguration.region
    );
    await cloudFormationClient.send(new UpdateStackCommand({
      StackName: stackName,
      TemplateBody: createStackTemplate,
      Capabilities: ["CAPABILITY_IAM"],
    }));
    await waitUntilStackUpdateComplete({
      client: cloudFormationClient,
      maxWaitTime: 360,
    }, {
      StackName: stackName,
    });
  }

  async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput> {
    const cloudFormationClient = new CloudFormationClient({ region: projectConfiguration.region });
    const s3Client = new S3({ region: projectConfiguration.region });
    const bucketName = `bucket-${projectConfiguration.region}-${projectConfiguration.name}`;
    const bucketKey = `lambda-${projectConfiguration.name}.zip`;
    const bucketResourceName = `Bucket${alphanumericString(projectConfiguration.name)}`;
    const stackName = `genezio-${projectConfiguration.name}`;
    const classes = [];

    for (const inputItem of input) {
      const classConfiguration = projectConfiguration.classes.find((c) => c.path === inputItem.filePath);
      const stackAlreadyExists = await this.#checkIfStackExists(cloudFormationClient, stackName);
      // If stack does not exist, we first create a stack with only an S3 bucket.
      if (!stackAlreadyExists) {
        await this.#initializeStack(cloudFormationClient, stackName, bucketName, bucketResourceName, projectConfiguration.name);
      }

      // Then we continue with the normal flow of uploading the zip file to S3 and updating the stack.
      log.info(`Uploading class ${inputItem.name} to S3...`)
      await this.#uploadZipToS3(s3Client, bucketName, bucketKey, inputItem.archivePath);

      await this.#updateStack(s3Client, cloudFormationClient, stackName, bucketName, bucketKey, bucketResourceName, projectConfiguration, inputItem, classConfiguration);

      const stackDetails = await cloudFormationClient.send(new DescribeStacksCommand({
        StackName: stackName,
      }));

      if (!stackDetails["Stacks"] || stackDetails["Stacks"].length === 0 || stackDetails["Stacks"][0]["StackStatus"] !== "UPDATE_COMPLETE") {
        debugLogger.error("Stack update failed", JSON.stringify(stackDetails));
        throw new Error("Stack update failed");
      }

      classes.push({
        className: inputItem.name,
        methods: inputItem.methods.map((method) => ({
          name: method.name,
          type: method.type,
          cronString: method.cronString
        })),
        functionUrl: stackDetails["Stacks"][0]["Outputs"]![0]["OutputValue"]!,
      })
    }

    return {
      classes: classes,
    }
  }
}

function alphanumericString(input: string): string {
  return input.replace(/[^0-9a-zA-Z]/g, "")
}
