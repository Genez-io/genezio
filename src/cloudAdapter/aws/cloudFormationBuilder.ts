export class GenezioCloudFormationBuilder {
    template: { [index: string]: any } = {};
    resourceIds: string[] = [];

    constructor() {
        this.template = {
            AWSTemplateFormatVersion: "2010-09-09",
            Outputs: {},
            Resources: {},
        };
    }

    addOutput(name: string, value: any) {
        this.template["Outputs"][name] = {
            Value: value,
        };
    }

    addResource(name: string, content: any) {
        this.template["Resources"][name] = content;
        this.resourceIds.push(name);
    }

    addDefaultResourcesForBackendDeployment(
        apiGatewayResourceName: string,
        apiGatewayName: string,
    ) {
        this.addResource(apiGatewayResourceName, {
            Type: "AWS::ApiGatewayV2::Api",
            Properties: {
                Name: apiGatewayName,
                ProtocolType: "HTTP",
                Description: `API Gateway for Genezio Project ${apiGatewayName}}`,
                CorsConfiguration: {
                    AllowOrigins: ["*"],
                    AllowMethods: ["*"],
                    AllowHeaders: ["*"],
                    MaxAge: 10800,
                },
            },
        });
        this.addResource("ApiStage", {
            Type: "AWS::ApiGatewayV2::Stage",
            Properties: {
                ApiId: {
                    Ref: apiGatewayResourceName,
                },
                AutoDeploy: true,
                StageName: "prod",
            },
        });

        this.addResource("ApiDeployment", {
            Type: "AWS::ApiGatewayV2::Deployment",
            DependsOn: [...this.resourceIds, "ApiStage"],
            Properties: {
                ApiId: {
                    Ref: apiGatewayResourceName,
                },
                StageName: "prod",
            },
        });
        this.template["Outputs"]["ApiUrl"] = {
            Description: "The URL of the API Gateway",
            Value: {
                "Fn::Join": [
                    "",
                    [
                        "https://",
                        {
                            Ref: apiGatewayResourceName,
                        },
                        ".execute-api.",
                        {
                            Ref: "AWS::Region",
                        },
                        ".amazonaws.com/prod/",
                    ],
                ],
            },
        };
    }

    build(): string {
        return JSON.stringify(this.template);
    }
}

export function getLambdaPermissionResource(
    lambdaFunctionResourceName: string,
    apiGatewayResourceName: string,
) {
    return {
        Type: "AWS::Lambda::Permission",
        Properties: {
            Action: "lambda:InvokeFunction",
            FunctionName: {
                "Fn::GetAtt": [lambdaFunctionResourceName, "Arn"],
            },
            Principal: "apigateway.amazonaws.com",
            SourceArn: {
                "Fn::Join": [
                    "",
                    [
                        "arn:aws:execute-api:",
                        {
                            Ref: "AWS::Region",
                        },
                        ":",
                        {
                            Ref: "AWS::AccountId",
                        },
                        ":",
                        {
                            Ref: apiGatewayResourceName,
                        },
                        "/*",
                    ],
                ],
            },
        },
    };
}

export function getApiGatewayRouteResource(
    apiGatewayResourceName: string,
    routeKey: string,
    integration: string,
) {
    return {
        Type: "AWS::ApiGatewayV2::Route",
        Properties: {
            ApiId: { Ref: apiGatewayResourceName },
            RouteKey: routeKey,
            Target: {
                "Fn::Join": [
                    "/",
                    [
                        "integrations",
                        {
                            Ref: integration,
                        },
                    ],
                ],
            },
        },
    };
}

export function getApiGatewayIntegrationResource(
    apiGatewayResourceName: string,
    lambdaFunctionResourceName: string,
) {
    return {
        Type: "AWS::ApiGatewayV2::Integration",
        Properties: {
            ApiId: { Ref: apiGatewayResourceName },
            IntegrationType: "AWS_PROXY",
            PayloadFormatVersion: "2.0",
            IntegrationUri: {
                "Fn::Join": [
                    "",
                    [
                        "arn:",
                        {
                            Ref: "AWS::Partition",
                        },
                        ":apigateway:",
                        {
                            Ref: "AWS::Region",
                        },
                        ":lambda:path/2015-03-31/functions/",
                        {
                            "Fn::GetAtt": [lambdaFunctionResourceName, "Arn"],
                        },
                        "/invocations",
                    ],
                ],
            },
        },
    };
}

export function getLambdaFunctionResource(
    name: string,
    runtime: string,
    roleResourceName: string,
    bucketName: string,
    bucketKey: string,
    latestObjectVersion: string,
) {
    return {
        Type: "AWS::Lambda::Function",
        Properties: {
            FunctionName: name,
            Handler: "index.handler",
            Architectures: ["arm64"],
            Runtime: runtime,
            Role: {
                "Fn::GetAtt": [roleResourceName, "Arn"],
            },
            Code: {
                S3Bucket: bucketName,
                S3Key: bucketKey,
                S3ObjectVersion: latestObjectVersion,
            },
            MemorySize: 1024,
            Timeout: 10,
        },
    };
}

export function getIamRoleResource() {
    return {
        Type: "AWS::IAM::Role",
        Properties: {
            AssumeRolePolicyDocument: {
                Version: "2012-10-17",
                Statement: [
                    {
                        Effect: "Allow",
                        Principal: {
                            Service: ["lambda.amazonaws.com"],
                        },
                        Action: ["sts:AssumeRole"],
                    },
                ],
            },
            Policies: [
                {
                    PolicyName: "LambdaExecutionPolicy",
                    PolicyDocument: {
                        Version: "2012-10-17",
                        Statement: [
                            {
                                Effect: "Allow",
                                Action: [
                                    "logs:CreateLogGroup",
                                    "logs:CreateLogStream",
                                    "logs:PutLogEvents",
                                ],
                                Resource: "arn:aws:logs:*:*:*",
                            },
                        ],
                    },
                },
            ],
        },
    };
}

export function getEventsRoleResource(
    scheduleExpression: string,
    lambdaFunctionResourceName: string,
    targetId: string,
    input: string,
) {
    return {
        Type: "AWS::Events::Rule",
        Properties: {
            ScheduleExpression: scheduleExpression,
            State: "ENABLED",
            Targets: [
                {
                    Arn: {
                        "Fn::GetAtt": [lambdaFunctionResourceName, "Arn"],
                    },
                    Id: targetId,
                    Input: {
                        "Fn::Sub": input,
                    },
                },
            ],
        },
    };
}

export function getLambdaPermissionForEventsResource(
    lambdaFunctionResourceName: string,
    cronResourceName: string,
) {
    return {
        Type: "AWS::Lambda::Permission",
        Properties: {
            Action: "lambda:InvokeFunction",
            FunctionName: {
                "Fn::GetAtt": [lambdaFunctionResourceName, "Arn"],
            },
            Principal: "events.amazonaws.com",
            SourceArn: {
                "Fn::GetAtt": [cronResourceName, "Arn"],
            },
        },
    };
}

export function getS3BucketResource(
    websiteConfiguration: any | undefined = undefined,
    accessControl: string | undefined = undefined,
    publicAccessBlockConfig: any | undefined = undefined,
) {
    const bucket: { [index: string]: any } = {
        Type: "AWS::S3::Bucket",
        Properties: {
            VersioningConfiguration: {
                Status: "Enabled",
            },
            BucketEncryption: {
                ServerSideEncryptionConfiguration: [
                    {
                        ServerSideEncryptionByDefault: {
                            SSEAlgorithm: "AES256",
                        },
                    },
                ],
            },
        },
    };

    if (websiteConfiguration) {
        bucket["Properties"]["WebsiteConfiguration"] = websiteConfiguration;
    }

    if (accessControl) {
        bucket["Properties"]["AccessControl"] = accessControl;
    }

    if (publicAccessBlockConfig) {
        bucket["Properties"]["PublicAccessBlockConfiguration"] = publicAccessBlockConfig;
    }

    return bucket;
}

export function getS3BucketPublicResource(bucketName: string) {
    return {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
            PolicyDocument: {
                Id: "S3Policy",
                Version: "2012-10-17",
                Statement: [
                    {
                        Sid: "PublicReadForGetBucketObjects",
                        Effect: "Allow",
                        Principal: "*",
                        Action: "s3:GetObject",
                        Resource: {
                            "Fn::Sub": "arn:aws:s3:::${" + bucketName + "}/*",
                        },
                    },
                ],
            },
            Bucket: {
                Ref: bucketName,
            },
        },
    };
}

export function getS3BucketPolicyResource() {
    return {
        Type: "AWS::S3::BucketPolicy",
        Properties: {
            Bucket: {
                Ref: "GenezioDeploymentBucket",
            },
            PolicyDocument: {
                Statement: [
                    {
                        Action: "s3:*",
                        Effect: "Deny",
                        Principal: "*",
                        Resource: [
                            {
                                "Fn::Join": [
                                    "",
                                    [
                                        "arn:",
                                        {
                                            Ref: "AWS::Partition",
                                        },
                                        ":s3:::",
                                        {
                                            Ref: "GenezioDeploymentBucket",
                                        },
                                        "/*",
                                    ],
                                ],
                            },
                            {
                                "Fn::Join": [
                                    "",
                                    [
                                        "arn:",
                                        {
                                            Ref: "AWS::Partition",
                                        },
                                        ":s3:::",
                                        {
                                            Ref: "GenezioDeploymentBucket",
                                        },
                                    ],
                                ],
                            },
                        ],
                        Condition: {
                            Bool: {
                                "aws:SecureTransport": false,
                            },
                        },
                    },
                ],
            },
        },
    };
}

export function getCloudFrontDistributionResource(bucketName: string, bucketResourceName: string) {
    return {
        Type: "AWS::CloudFront::Distribution",
        Properties: {
            DistributionConfig: {
                Origins: [
                    {
                        DomainName: {
                            "Fn::Select": [
                                1,
                                {
                                    "Fn::Split": [
                                        "//",
                                        {
                                            "Fn::GetAtt": [bucketResourceName, "WebsiteURL"],
                                        },
                                    ],
                                },
                            ],
                        },
                        Id: bucketName,
                        CustomOriginConfig: {
                            OriginProtocolPolicy: "http-only",
                            HTTPPort: 80,
                        },
                    },
                ],
                CustomErrorResponses: [
                    {
                        ErrorCode: 404,
                        ResponseCode: 200,
                        ResponsePagePath: "/index.html",
                    },
                ],
                Enabled: true,
                Comment: "CloudFront distribution for the website",
                DefaultRootObject: "index.html",
                PriceClass: "PriceClass_100",
                DefaultCacheBehavior: {
                    TargetOriginId: bucketName,
                    ViewerProtocolPolicy: "redirect-to-https",
                    AllowedMethods: ["GET", "HEAD", "OPTIONS"],
                    CachedMethods: ["GET", "HEAD"],
                    ForwardedValues: {
                        QueryString: false,
                        Cookies: { Forward: "none" },
                    },
                },
            },
        },
    };
}
