import fs from "fs";
import { ProjectConfiguration } from "../models/projectConfiguration";
import { CloudAdapter, GenezioCloudInput, GenezioCloudOutput } from "./cloudAdapter";
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand, CreateStackCommandInput, UpdateStackCommand, UpdateStackCommandOutput, DescribeStacksCommandOutput, waitUntilStackCreateComplete, waitUntilStackUpdateComplete } from "@aws-sdk/client-cloudformation";
import { PutObjectCommand, S3 } from "@aws-sdk/client-s3";


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

    getCloudFormationTemplate(bucketName: string, bucketKey: string, runtime: string, bucketResource: string, projectName: string, className: string, region: string) {
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
                  "Runtime": "${runtime}",
                  "Role": {
                    "Fn::GetAtt": ["LambdaExecutionRole", "Arn"]
                  },
                  "Code": {
                    "S3Bucket": "${bucketName}",
                    "S3Key": "${bucketKey}"
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
                "Type": "AWS::ApiGateway::RestApi",
                "Properties": {
                  "Name": "MyApi",
                  "Description": "API Gateway with CORS enabled"
                }
              },
              "ApiResource": {
                "Type": "AWS::ApiGateway::Resource",
                "Properties": {
                  "RestApiId": {
                    "Ref": "${apiGatewayResource}"
                  },
                  "ParentId": {
                    "Fn::GetAtt": ["${apiGatewayResource}", "RootResourceId"]
                  },
                  "PathPart": "/"
                }
              },
              "ApiMethod": {
                "Type": "AWS::ApiGateway::Method",
                "Properties": {
                  "RestApiId": {
                    "Ref": "${apiGatewayResource}"
                  },
                  "ResourceId": {
                    "Ref": "ApiResource"
                  },
                  "HttpMethod": "POST",
                  "AuthorizationType": "NONE",
                  "Integration": {
                    "Type": "AWS_PROXY",
                    "IntegrationHttpMethod": "POST",
                    "Uri": {
                      "Fn::Join": [
                        "",
                        [
                          "arn:aws:apigateway:",
                          {
                            "Ref": "AWS::Region"
                          },
                          ":lambda:path/2015-03-31/functions/",
                          {
                            "Fn::GetAtt": ["${functionResource}", "Arn"]
                          },
                          "/invocations"
                        ]
                      ]
                    }
                  }
                }
              },
              "ApiOptionsMethod": {
                "Type": "AWS::ApiGateway::Method",
                "Properties": {
                  "RestApiId": {
                    "Ref": "${apiGatewayResource}"
                  },
                  "ResourceId": {
                    "Ref": "ApiResource"
                  },
                  "HttpMethod": "OPTIONS",
                  "AuthorizationType": "NONE",
                  "Integration": {
                    "Type": "MOCK",
                    "RequestTemplates": {
                      "application/json": "{\\"statusCode\\": 200}"
                    }
                  },
                  "MethodResponses": [
                    {
                      "StatusCode": 200,
                      "ResponseParameters": {
                        "method.response.header.Access-Control-Allow-Headers": true,
                        "method.response.header.Access-Control-Allow-Methods": true,
                        "method.response.header.Access-Control-Allow-Origin": true
                      },
                      "ResponseModels": {
                        "application/json": "Empty"
                      }
                    }
                  ]
                }
              },
              "ApiDeployment": {
                "Type": "AWS::ApiGateway::Deployment",
                "DependsOn": ["ApiMethod", "ApiOptionsMethod"],
                "Properties": {
                  "RestApiId": {
                    "Ref": "${apiGatewayResource}"
                  },
                  "StageName": "prod"
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

    async #createStackCommand(client: CloudFormationClient, input: CreateStackCommandInput) {
        const createStackInput = { // CreateStackInput
            StackName: "STRING_VALUE", // required
            TemplateBody: "STRING_VALUE",
        };
        const command = new CreateStackCommand(createStackInput);

    }

    async #describeStackCommand(client: CloudFormationClient, input: DescribeStacksCommand): Promise<DescribeStacksCommandOutput> {
        return await client.send(input);
    }

    async #updateStackCommand(client: CloudFormationClient, input: UpdateStackCommand): Promise<UpdateStackCommandOutput> {
        return await client.send(input);
    }

    async #uploadZipToS3(client: S3, bucket: string, key: string, path: string) {
        const commandParams = {};

        const content = fs.readFileSync(path);

        try {
            const result = await client.send(new PutObjectCommand({
                Body: content,
                Bucket: bucket,
                Key: key,
            }));

            console.log("upload zip to s3", result);
        } catch (e) {
            console.log("Fail while uploading zip to s3", e);
            // TODO: handle error
        }
    }

    async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput> {
        const cloudFormationClient = new CloudFormationClient({ region: projectConfiguration.region });
        const s3Client = new S3({ region: projectConfiguration.region });
        const bucketName = `bucket-${projectConfiguration.region}-${projectConfiguration.name}-3`;
        const bucketKey = `lambda-${projectConfiguration.name}.zip`;
        const bucketResourceName = `Bucket${alphanumericString(projectConfiguration.name)}`;

        for (const inputItem of input) {
            // TODO: check if stack exists
            const result = await this.#describeStackCommand(cloudFormationClient, new DescribeStacksCommand({
                StackName: projectConfiguration.name,
            })).catch((e) => {
                if (e.message == "Stack with id " + projectConfiguration.name + " does not exist") {
                    return undefined;
                }
                throw e
            });

            if (!result) {
                await this.#uploadZipToS3(s3Client, bucketName, bucketKey, inputItem.archivePath);

                const createStackTemplate = this.getCloudFormationTemplate(bucketName, bucketKey, "nodejs14.x", bucketResourceName, projectConfiguration.name, inputItem.name, projectConfiguration.region);
                console.log(createStackTemplate);
                const createStackResponse = await cloudFormationClient.send(new UpdateStackCommand({
                    StackName: `genezio-${projectConfiguration.name}`,
                    TemplateBody: createStackTemplate,
                    Capabilities: ["CAPABILITY_IAM"],
                }));
                const result = await waitUntilStackUpdateComplete({
                    client: cloudFormationClient,
                    maxWaitTime: 60,
                }, {
                    StackName: `genezio-${projectConfiguration.name}`,
                });
                console.log(result);
            } else {
                // create stack that includes only the s3 bucket
                const template = this.getS3CloudFormationTemplate(bucketName, bucketResourceName, projectConfiguration.name);
                const response = await cloudFormationClient.send(new CreateStackCommand({
                    StackName: `genezio-${projectConfiguration.name}`,
                    TemplateBody: template,
                }));


                let result = await waitUntilStackCreateComplete({
                    client: cloudFormationClient,
                    maxWaitTime: 60,
                }, {
                    StackName: `genezio-${projectConfiguration.name}`,
                });

                if (result.state === "SUCCESS") {
                    console.log("success", result);
                } else {
                    console.log("fail", result);
                }

                await this.#uploadZipToS3(s3Client, bucketName, bucketKey, inputItem.archivePath);

                const createStackTemplate = this.getCloudFormationTemplate(bucketName, bucketKey, "nodejs14.x", bucketResourceName, projectConfiguration.name, inputItem.name, projectConfiguration.region);
                const createStackResponse = await cloudFormationClient.send(new UpdateStackCommand({
                    StackName: `genezio-${projectConfiguration.name}`,
                    TemplateBody: JSON.stringify(createStackTemplate),
                }));
                result = await waitUntilStackUpdateComplete({
                    client: cloudFormationClient,
                    maxWaitTime: 60,
                }, {
                    StackName: `genezio-${projectConfiguration.name}`,
                });

                const stackDetails = await cloudFormationClient.send(new DescribeStacksCommand({
                    StackName: `genezio-${projectConfiguration.name}`,
                }))

                console.log(stackDetails);
            }
        }

        // upload to s3 bucket
        // make a stack update that creates the lambda and everything else

        return Promise.reject();
    }
}

function alphanumericString(input: string): string {
    return input.replace(/[^0-9a-zA-Z]/g, "")
}
