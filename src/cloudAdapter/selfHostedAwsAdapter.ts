import fs from "fs";
import { ClassConfiguration, ProjectConfiguration } from "../models/projectConfiguration";
import { CloudAdapter, GenezioCloudInput, GenezioCloudOutput } from "./cloudAdapter";
import { CloudFormationClient, CreateStackCommand, DescribeStacksCommand, CreateStackCommandInput, UpdateStackCommand, UpdateStackCommandOutput, DescribeStacksCommandOutput, waitUntilStackCreateComplete, waitUntilStackUpdateComplete, DeleteStackCommand, waitUntilStackDeleteComplete } from "@aws-sdk/client-cloudformation";
import { CreateBucketCommand, HeadObjectCommand, PutBucketVersioningCommand, PutObjectCommand, S3, S3Client } from "@aws-sdk/client-s3";
import { debugLogger } from "../utils/logging";
import log from "loglevel";


class GenezioCloudFormationBuilder {
  template: { [index: string]: any } = {};
  resourceIds: string[] = [];
  apiGatewayResourceName: string;

  constructor(apiGatewayResourceName: string) {
    this.apiGatewayResourceName = apiGatewayResourceName;
    this.template = {
      "Resources": {
        [apiGatewayResourceName]: {
          "Type": "AWS::ApiGatewayV2::Api",
          "Properties": {
            "Name": apiGatewayResourceName,
            "ProtocolType": "HTTP",
            "Description": `API Gateway for Genezio Project ${apiGatewayResourceName}}`,
            "CorsConfiguration": {
              "AllowOrigins": ["*"],
              "AllowMethods": ["*"],
              "AllowHeaders": ["*"],
              "MaxAge": 10800
            }
          }
        },
      },
      "AWSTemplateFormatVersion": "2010-09-09",
    }
  }

  addResource(name: string, content: any) {
    this.template["Resources"][name] = content;
    this.resourceIds.push(name);
  }

  build(): string {
    this.template["Resources"]["ApiStage"] = {
      "Type": "AWS::ApiGatewayV2::Stage",
      "Properties": {
        "ApiId": {
          "Ref": this.apiGatewayResourceName,
        },
        "AutoDeploy": true,
        "StageName": "prod"
      }
    };

    this.template["Resources"]["ApiDeployment"] = {
      "Type": "AWS::ApiGatewayV2::Deployment",
      "DependsOn": [...this.resourceIds, "ApiStage"],
      "Properties": {
        "ApiId": {
          "Ref": this.apiGatewayResourceName
        },
        "StageName": "prod"
      }
    };
    this.template["Outputs"] = {
      "ApiUrl": {
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
      }
    }

    console.log(this.template)
    return JSON.stringify(this.template);
  }
}

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

  async #checkIfStackExists(client: CloudFormationClient, stackName: string): Promise<{exists: boolean, status?: string}> {
    return await client.send(new DescribeStacksCommand({
      StackName: stackName,
    }))
      .then((stack) => {
        if (stack.Stacks?.length === 0) {
          return { exists: false, status: undefined };
        } else {
          return { exists: true, status: stack.Stacks?.[0].StackStatus };
        }
      })
      .catch((e) => {
        if (e.message === "Stack with id " + stackName + " does not exist") {
          return { exists: false, status: undefined };
        }

        throw e
      })
  }

  async #bucketForProjectExists(client: S3, bucketName: string): Promise<boolean> {
    const params = {
      Bucket: bucketName
    };

    return new Promise((resolve) => {
      client.headBucket(params, function (err: unknown) {
        if (err) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
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
    const { exists, status } = await this.#checkIfStackExists(cloudFormationClient, stackName);


    if (!exists) {
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
    } else if (exists && status === "ROLLBACK_COMPLETE") {
      await cloudFormationClient.send(new DeleteStackCommand({
        StackName: stackName,
      }));
      await waitUntilStackDeleteComplete({
        client: cloudFormationClient,
        maxWaitTime: 360,
      }, {
        StackName: stackName,
      });
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
    } else {
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
  }

  async deploy(input: GenezioCloudInput[], projectConfiguration: ProjectConfiguration): Promise<GenezioCloudOutput> {
    const cloudFormationClient = new CloudFormationClient({ region: projectConfiguration.region });
    const s3Client = new S3({ region: projectConfiguration.region });
    const bucketName = `bucket-${projectConfiguration.region}-${projectConfiguration.name}`;
    const bucketResourceName = `Bucket${alphanumericString(projectConfiguration.name)}`;
    const stackName = `genezio-${projectConfiguration.name}`;

    const bucketExists = await this.#bucketForProjectExists(s3Client, bucketName);

    if (!bucketExists) {
      // If bucket does not exist, create it
      console.log(projectConfiguration.region)
      await s3Client.send(new CreateBucketCommand({
        Bucket: bucketName,
        CreateBucketConfiguration: {
          // Weird issue https://github.com/aws/aws-sdk-js/issues/3647
          LocationConstraint: projectConfiguration.region === "us-east-1" ? undefined : projectConfiguration.region,
        },
      }));

      await s3Client.send(new PutBucketVersioningCommand({
        Bucket: bucketName,
        VersioningConfiguration: {
          Status: "Enabled",
        },
      }));
    }
    // verific existenta bucketului de proiect
    const apiGatewayResourceName = `ApiGateway${alphanumericString(projectConfiguration.name)}`;
    const cloudFormationTemplate = new GenezioCloudFormationBuilder(apiGatewayResourceName);

    for (const inputItem of input) {
      const classConfiguration = projectConfiguration.classes.find((c) => c.path === inputItem.filePath);
      const bucketKey = `genezio-${projectConfiguration.name}/lambda-${inputItem.name}.zip`;
      const lambdaFunctionResourceName = `LambdaFunction${alphanumericString(inputItem.name)}`;
      const invokePermissionResourceName = `LambdaInvokePermission${alphanumericString(inputItem.name)}`;
      const routeResourceName = `Route${alphanumericString(inputItem.name)}`;
      const integrationResourceName = `Integration${alphanumericString(inputItem.name)}`;
      const roleResourceName = `Role${alphanumericString(inputItem.name)}`;

      log.info(`Uploading class ${inputItem.name} to S3...`)
      await this.#uploadZipToS3(s3Client, bucketName, bucketKey, inputItem.archivePath);

      // fac urmatoarele resurse:
      //    - LambdaInvokePermission
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

      classConfiguration?.methods.forEach((m) => console.log(m))
      //    - Route
      classConfiguration?.methods.filter((m) => m.type === "http").forEach((m) => {

        cloudFormationTemplate.addResource(routeResourceName+m.name, {
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
      //    - Integration

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
      //    - Function
      const runtime = this.#getFunctionRuntime(classConfiguration!.language);
      cloudFormationTemplate.addResource(lambdaFunctionResourceName, {
        "Type": "AWS::Lambda::Function",
        "Properties": {
          "FunctionName": lambdaFunctionResourceName,
          "Handler": "index.handler",
          "Architectures": ["arm64"],
          "Runtime": runtime,
          "Role": {
            "Fn::GetAtt": [roleResourceName, "Arn"]
          },
          "Code": {
            "S3Bucket": bucketName,
            "S3Key": bucketKey,
            "S3ObjectVersion": (await this.getLatestObjectVersion(s3Client, bucketName, bucketKey))
          },
          "MemorySize": 1024,
          "Timeout": 10
        }
      });
      //    - LambdaExecutionRole
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
    }

    const templateResult = cloudFormationTemplate.build();

    console.log(templateResult);
    await this.#updateStack(cloudFormationClient, templateResult, stackName);

    const stackDetails = await cloudFormationClient.send(new DescribeStacksCommand({
      StackName: stackName,
    }));

    const classes = [];
    console.log(JSON.stringify(stackDetails));

    if (!stackDetails["Stacks"] || stackDetails["Stacks"].length === 0 || (stackDetails["Stacks"][0]["StackStatus"] !== "UPDATE_COMPLETE" && stackDetails["Stacks"][0]["StackStatus"] !== "CREATE_COMPLETE")) {
      debugLogger.error("Stack update failed", JSON.stringify(stackDetails));
      throw new Error("Stack update failed");
    }

    for (const inputItem of input) {
      const classConfiguration = projectConfiguration.classes.find((c) => c.path === inputItem.filePath);

      let functionUrl;

      if (classConfiguration?.type === "http") {
        functionUrl = `${stackDetails["Stacks"][0]["Outputs"]![0]["OutputValue"]!}/`
      } else {
        functionUrl = `${stackDetails["Stacks"][0]["Outputs"]![0]["OutputValue"]!}/${inputItem.name}`
      }

      classes.push({
        className: inputItem.name,
        methods: inputItem.methods.map((method) => ({
          name: method.name,
          type: method.type,
          cronString: method.cronString
        })),
        functionUrl: functionUrl,
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
