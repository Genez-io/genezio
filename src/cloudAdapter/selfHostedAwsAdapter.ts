import fs from "fs";
import { ProjectConfiguration } from "../models/projectConfiguration";
import { CloudAdapter, GenezioCloudInput, GenezioCloudOutput } from "./cloudAdapter";
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand, CreateStackCommandInput, UpdateStackCommand, UpdateStackCommandOutput, DescribeStacksCommandOutput, waitUntilStackCreateComplete, waitUntilStackUpdateComplete, DeleteStackCommand, waitUntilStackDeleteComplete } from "@aws-sdk/client-cloudformation";
import { CreateBucketCommand, HeadObjectCommand, PutBucketVersioningCommand, PutObjectCommand, S3, S3Client } from "@aws-sdk/client-s3";
import { debugLogger } from "../utils/logging";
import log from "loglevel";
import { getFileSize } from "../utils/file";
import { BUNDLE_SIZE_LIMIT } from "./genezioAdapter";


class GenezioCloudFormationBuilder {
  template: { [index: string]: any } = {};
  resourceIds: string[] = [];
  apiGatewayResourceName: string;
  apiGatewayName: string;

  constructor(apiGatewayResourceName: string, apiGatewayName: string) {
    this.apiGatewayResourceName = apiGatewayResourceName;
    this.apiGatewayName = apiGatewayName;
    this.template = {
      "AWSTemplateFormatVersion": "2010-09-09",
      "Outputs": {
        "GenezioDeploymentBucketName": {
          "Value": {
            "Ref": "GenezioDeploymentBucket"
          }
        }
      },
      "Resources": {
      },
    }
    this.addResource("GenezioDeploymentBucket", {
      "Type": "AWS::S3::Bucket",
      "Properties": {
        "VersioningConfiguration": {
          "Status": "Enabled"
        },
        "BucketEncryption": {
          "ServerSideEncryptionConfiguration": [
            {
              "ServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
              }
            }
          ]
        }
      }
    });

    this.addResource("GenezioDeploymentBucketPolicy", {
      "Type": "AWS::S3::BucketPolicy",
      "Properties": {
        "Bucket": {
          "Ref": "GenezioDeploymentBucket"
        },
        "PolicyDocument": {
          "Statement": [
            {
              "Action": "s3:*",
              "Effect": "Deny",
              "Principal": "*",
              "Resource": [
                {
                  "Fn::Join": [
                    "",
                    [
                      "arn:",
                      {
                        "Ref": "AWS::Partition"
                      },
                      ":s3:::",
                      {
                        "Ref": "GenezioDeploymentBucket"
                      },
                      "/*"
                    ]
                  ]
                },
                {
                  "Fn::Join": [
                    "",
                    [
                      "arn:",
                      {
                        "Ref": "AWS::Partition"
                      },
                      ":s3:::",
                      {
                        "Ref": "GenezioDeploymentBucket"
                      }
                    ]
                  ]
                }
              ],
              "Condition": {
                "Bool": {
                  "aws:SecureTransport": false
                }
              }
            }
          ]
        }
      }
    });
  }

  addResource(name: string, content: any) {
    this.template["Resources"][name] = content;
    this.resourceIds.push(name);
  }

  addDefaultResources() {
    this.addResource(this.apiGatewayResourceName, {
      "Type": "AWS::ApiGatewayV2::Api",
      "Properties": {
        "Name": this.apiGatewayName,
        "ProtocolType": "HTTP",
        "Description": `API Gateway for Genezio Project ${this.apiGatewayName}}`,
        "CorsConfiguration": {
          "AllowOrigins": ["*"],
          "AllowMethods": ["*"],
          "AllowHeaders": ["*"],
          "MaxAge": 10800
        }
      }
    })
    this.addResource("ApiStage", {
      "Type": "AWS::ApiGatewayV2::Stage",
      "Properties": {
        "ApiId": {
          "Ref": this.apiGatewayResourceName,
        },
        "AutoDeploy": true,
        "StageName": "prod"
      }
    });

    this.addResource("ApiDeployment", {
      "Type": "AWS::ApiGatewayV2::Deployment",
      "DependsOn": [...this.resourceIds, "ApiStage"],
      "Properties": {
        "ApiId": {
          "Ref": this.apiGatewayResourceName
        },
        "StageName": "prod"
      }
    });
    this.template["Outputs"]["ApiUrl"] = {
      "Description": "The URL of the API Gateway",
      "Value": {
        "Fn::Join": [
          "",
          [
            "https://",
            {
              "Ref": this.apiGatewayResourceName
            },
            ".execute-api.",
            {
              "Ref": "AWS::Region"
            },
            ".amazonaws.com/prod/"
          ]
        ]
      }
    };
  }

  build(): string {
    return JSON.stringify(this.template);
  }
}

export class SelfHostedAwsAdapter implements CloudAdapter {

  async #getLatestObjectVersion(cliet: S3, bucket: string, key: string): Promise<string | undefined> {
    const result = await cliet.send(new HeadObjectCommand({
      Bucket: bucket,
      Key: key,
    }));

    return result.VersionId;
  }

  async #checkIfStackExists(client: CloudFormationClient, stackName: string): Promise<{ exists: boolean }> {
    return await client.send(new DescribeStacksCommand({
      StackName: stackName,
    }))
      .then(async (stack) => {
        if (stack.Stacks?.length === 0) {
          return { exists: false };
        } else {
          const status = stack.Stacks?.[0].StackStatus;
          // If the stack is in ROLLBACK_COMPLETE status, we need to delete it. A stack in the ROLLBACK_COMPLETE state does not really exists.
          if (status === "ROLLBACK_COMPLETE") {
            debugLogger.debug("Stack in ROLLBACK_COMPLETE state. Deleting it...");
            await client.send(new DeleteStackCommand({
              StackName: stackName,
            }));
            await waitUntilStackDeleteComplete({
              client: client,
              maxWaitTime: 360,
            }, {
              StackName: stackName,
            });

            return { exists: false };
          }

          return { exists: true };
        }
      })
      .catch((e) => {
        if (e.message === "Stack with id " + stackName + " does not exist") {
          return { exists: false };
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

  async #updateStack(cloudFormationClient: CloudFormationClient, createStackTemplate: string, stackName: string) {
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

  #cronToAWSCron(unixCron: string): string {
    const cronParts: string[] = unixCron.split(" ");

    if (cronParts[2] === "*" && cronParts[4] === "*") {
      cronParts[4] = "?";
    } else if (cronParts[2] === "*" && cronParts[4] !== "*") {
      cronParts[2] = "?";
    } else if (cronParts[2] !== "*" && cronParts[4] === "*") {
      cronParts[4] = "?";
    }

    const awsCron: string =
      cronParts[0] + " " + cronParts[1] + " " + cronParts[2] + " " + cronParts[3] + " " + cronParts[4] + " *";

    return awsCron;
  }

  #findOutputValue(stackDetails: DescribeStacksCommandOutput, key: string): string | undefined {
    const output = stackDetails.Stacks?.[0].Outputs?.find((output) => output.OutputKey === key);
    return output?.OutputValue;
  }

  async #getValueForKeyFromOutput(cloudFormationClient: CloudFormationClient, stackName: string, key: string): Promise<string> {
    const bucketStackDetails = await cloudFormationClient.send(new DescribeStacksCommand({
      StackName: stackName,
    }));

    const successCloudFormationStatus = ["UPDATE_COMPLETE", "CREATE_COMPLETE", "UPDATE_ROLLBACK_COMPLETE", "ROLLBACK_COMPLETE"];
    if (!bucketStackDetails["Stacks"] || bucketStackDetails["Stacks"].length === 0 || !bucketStackDetails["Stacks"][0]["StackStatus"] || !successCloudFormationStatus.includes(bucketStackDetails["Stacks"][0]["StackStatus"])) {
      debugLogger.error("Stack does not exists!", JSON.stringify(bucketStackDetails));
      throw new Error("A problem occured while deploying your application. Please check the status of your CloudFormation stack.");
    }

    if (bucketStackDetails["Stacks"][0]["StackStatus"] === "ROLLBACK_COMPLETE") {
      await cloudFormationClient.send(new DeleteStackCommand({
        StackName: stackName,
      }));
      await waitUntilStackDeleteComplete({
        client: cloudFormationClient,
        maxWaitTime: 360,
      }, {
        StackName: stackName,
      });
    }

    const bucketName = this.#findOutputValue(bucketStackDetails, key);
    if (!bucketName) {
      debugLogger.error("Could not find bucket name output in cloud formation describe output.", JSON.stringify(bucketStackDetails));
      throw new Error("A problem occured while deploying your application. Please check the status of your CloudFormation stack.");
    }

    return bucketName;
  }

  #getBucketKey(projectName: string, className: string): string {
    return `genezio-${projectName}/lambda-${className}.zip`
  }

  async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput> {
    const cloudFormationClient = new CloudFormationClient({ region: projectConfiguration.region });
    const s3Client = new S3({ region: projectConfiguration.region });
    const stackName = `genezio-${projectConfiguration.name}`;
    const { exists } = await this.#checkIfStackExists(cloudFormationClient, stackName);

    const credentials = await s3Client.config.credentials();
    if (!credentials) {
      throw new Error("AWS credentials not found");
    }
    log.info(`Deploying your backend project to the account represented by access key ID ${credentials.accessKeyId}...`);

    const apiGatewayResourceName = `ApiGateway${alphanumericString(projectConfiguration.name)}`;
    const apiGatewayName = `${projectConfiguration.name}`;
    const cloudFormationTemplate = new GenezioCloudFormationBuilder(apiGatewayResourceName, apiGatewayName);

    // Check if stack already exists. If it already exists, we need to send a describe-stack command to get the bucket name.
    // If the stack does not exists, we need to first create a stack with just one s3 resource.
    if (!exists) {
      debugLogger.debug("The stack does not exists. Creating a new stack...")
      const createStackTemplate = cloudFormationTemplate.build();
      await cloudFormationClient.send(new CreateStackCommand({
        StackName: stackName,
        TemplateBody: createStackTemplate,
        Capabilities: ["CAPABILITY_IAM"],
      }));

      await waitUntilStackCreateComplete({
        client: cloudFormationClient,
        maxWaitTime: 360,
      }, {
        StackName: stackName,
      });
    }
    const bucketName = await this.#getValueForKeyFromOutput(cloudFormationClient, stackName, "GenezioDeploymentBucketName");

    const uploadFilesPromises = input.map(async (inputItem) => {
      const bucketKey = this.#getBucketKey(projectConfiguration.name, inputItem.name);

      const size = await getFileSize(inputItem.archivePath);
      if (size > BUNDLE_SIZE_LIMIT) {
        throw new Error(`Your class ${inputItem.name} is too big: ${size} bytes. The maximum size is 250MB. Try to reduce the size of your class.`);
      }

      log.info(`Uploading class ${inputItem.name} to S3...`)
      return this.#uploadZipToS3(s3Client, bucketName, bucketKey, inputItem.archivePath);
    })

    await Promise.all(uploadFilesPromises);

    for (const inputItem of input) {
      const classConfiguration = projectConfiguration.classes.find((c) => c.path === inputItem.filePath);
      const bucketKey = this.#getBucketKey(projectConfiguration.name, inputItem.name);
      const lambdaFunctionResourceName = `LambdaFunction${alphanumericString(inputItem.name)}`;
      const lambdaFunctionName = `${projectConfiguration.name.toLowerCase()}-${inputItem.name.toLowerCase()}`;
      const invokePermissionResourceName = `LambdaInvokePermission${alphanumericString(inputItem.name)}`;
      const routeResourceName = `Route${alphanumericString(inputItem.name)}`;
      const integrationResourceName = `Integration${alphanumericString(inputItem.name)}`;
      const roleResourceName = `Role${alphanumericString(inputItem.name)}`;

      // Create the LambdaInvokePermission
      cloudFormationTemplate.addResource(invokePermissionResourceName, {
        "Type": "AWS::Lambda::Permission",
        "Properties": {
          "Action": "lambda:InvokeFunction",
          "FunctionName": {
            "Fn::GetAtt": [lambdaFunctionResourceName, "Arn"]
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
                  "Ref": apiGatewayResourceName
                },
                "/*"
              ]
            ]
          }
        }
      });

      // Create the route
      classConfiguration?.methods.filter((m) => m.type === "http").forEach((m) => {

        cloudFormationTemplate.addResource(routeResourceName + m.name, {
          "Type": "AWS::ApiGatewayV2::Route",
          "Properties": {
            "ApiId": { "Ref": apiGatewayResourceName },
            "RouteKey": `ANY /${inputItem.name}/${m.name}`,
            "Target": {
              "Fn::Join": [
                "/",
                [
                  "integrations",
                  {
                    "Ref": integrationResourceName
                  }
                ]
              ]
            }
          }
        },);
      });

      cloudFormationTemplate.addResource(routeResourceName, {
        "Type": "AWS::ApiGatewayV2::Route",
        "Properties": {
          "ApiId": { "Ref": apiGatewayResourceName },
          "RouteKey": `ANY /${inputItem.name}`,
          "Target": {
            "Fn::Join": [
              "/",
              [
                "integrations",
                {
                  "Ref": integrationResourceName
                }
              ]
            ]
          }
        }
      },);

      // Create the integration
      cloudFormationTemplate.addResource(integrationResourceName, {
        "Type": "AWS::ApiGatewayV2::Integration",
        "Properties": {
          "ApiId": { "Ref": apiGatewayResourceName },
          "IntegrationType": "AWS_PROXY",
          "PayloadFormatVersion": "2.0",
          "IntegrationUri": {
            "Fn::Join": [
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
                    lambdaFunctionResourceName,
                    "Arn"
                  ]
                },
                "/invocations"
              ]
            ]
          }
        }
      });
      // Create the lambda function
      const runtime = this.#getFunctionRuntime(classConfiguration!.language);
      cloudFormationTemplate.addResource(lambdaFunctionResourceName, {
        "Type": "AWS::Lambda::Function",
        "Properties": {
          "FunctionName": lambdaFunctionName,
          "Handler": "index.handler",
          "Architectures": ["arm64"],
          "Runtime": runtime,
          "Role": {
            "Fn::GetAtt": [roleResourceName, "Arn"]
          },
          "Code": {
            "S3Bucket": bucketName,
            "S3Key": bucketKey,
            "S3ObjectVersion": (await this.#getLatestObjectVersion(s3Client, bucketName, bucketKey))
          },
          "MemorySize": 1024,
          "Timeout": 10
        }
      });
      // Create the lambda execution role
      cloudFormationTemplate.addResource(roleResourceName, {
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
      });

      for (const method of inputItem.methods) {
        if (method.type === "cron") {
          const cronResourceName = `Cron${alphanumericString(inputItem.name)}${alphanumericString(method.name)}`;
          const lambdaPermissionName = `LambdaPermission${alphanumericString(inputItem.name)}${alphanumericString(method.name)}`;
          cloudFormationTemplate.addResource(cronResourceName, {
            "Type": "AWS::Events::Rule",
            "Properties": {
              "ScheduleExpression": `cron(${this.#cronToAWSCron(method.cronString!)})`,
              "State": "ENABLED",
              "Targets": [
                {
                  "Arn": {
                    "Fn::GetAtt": [lambdaFunctionResourceName, "Arn"]
                  },
                  "Id": `target_id_${method.name}`,
                  "Input": {
                    "Fn::Sub": `{"genezioEventType": "cron", "cronString": "${this.#cronToAWSCron(method.cronString!)}", "methodName": "${method.name}"}`
                  }
                }
              ]
            }
          });

          cloudFormationTemplate.addResource(lambdaPermissionName, {
            "Type": "AWS::Lambda::Permission",
            "Properties": {
              "Action": "lambda:InvokeFunction",
              "FunctionName": {
                "Fn::GetAtt": [
                  lambdaFunctionResourceName,
                  "Arn"
                ]
              },
              "Principal": "events.amazonaws.com",
              "SourceArn": {
                "Fn::GetAtt": [
                  cronResourceName,
                  "Arn"
                ]
              }
            }
          },
          )
        }
      }
    }

    cloudFormationTemplate.addDefaultResources();
    const templateResult = cloudFormationTemplate.build();

    debugLogger.debug(templateResult);
    // Once we have the template, we can create or update the CloudFormation stack.
    await this.#updateStack(cloudFormationClient, templateResult, stackName);
    const classes = [];
    const apiGatewayUrl = await this.#getValueForKeyFromOutput(cloudFormationClient, stackName, "ApiUrl");

    for (const inputItem of input) {
      classes.push({
        className: inputItem.name,
        methods: inputItem.methods.map((method) => ({
          name: method.name,
          type: method.type,
          cronString: method.cronString,
          functionUrl: getFunctionUrl(`${apiGatewayUrl}`, method.type, inputItem.name, method.name)
        })),
        functionUrl: `${apiGatewayUrl}/${inputItem.name}`,
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

function getFunctionUrl(baseUrl: string, methodType: string, className: string, methodName: string): string {
  if (methodType === "http") {
    return `${baseUrl}/${className}/${methodName}`;
  } else {
    return `${baseUrl}/${className}`;
  }
}