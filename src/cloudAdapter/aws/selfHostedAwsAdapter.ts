import fs from "fs";
import { ProjectConfiguration } from "../../models/projectConfiguration.js";
import {
    CloudAdapter,
    CloudAdapterOptions,
    GenezioCloudInput,
    GenezioCloudOutput,
} from "../cloudAdapter.js";
import {
    CloudFormationClient,
    CreateStackCommand,
    DescribeStacksCommand,
    UpdateStackCommand,
    DescribeStacksCommandOutput,
    waitUntilStackCreateComplete,
    waitUntilStackUpdateComplete,
    DeleteStackCommand,
    waitUntilStackDeleteComplete,
} from "@aws-sdk/client-cloudformation";
import { HeadObjectCommand, PutObjectCommand, S3 } from "@aws-sdk/client-s3";
import { debugLogger } from "../../utils/logging.js";
import log from "loglevel";
import { YamlFrontend } from "../../models/yamlProjectConfiguration.js";
import { getAllFilesRecursively, getFileSize } from "../../utils/file.js";
import {
    GenezioCloudFormationBuilder,
    getApiGatewayIntegrationResource,
    getApiGatewayRouteResource,
    getCloudFrontDistributionResource,
    getEventsRoleResource,
    getIamRoleResource,
    getLambdaFunctionResource,
    getLambdaPermissionForEventsResource,
    getLambdaPermissionResource,
    getS3BucketPolicyResource,
    getS3BucketPublicResource,
    getS3BucketResource,
} from "./cloudFormationBuilder.js";
import mime from "mime-types";

const BUNDLE_SIZE_LIMIT = 256901120;

export class SelfHostedAwsAdapter implements CloudAdapter {
    async #getLatestObjectVersion(
        client: S3,
        bucket: string,
        key: string,
    ): Promise<string | undefined> {
        const result = await client.send(
            new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            }),
        );

        return result.VersionId;
    }

    async #checkIfStackExists(
        client: CloudFormationClient,
        stackName: string,
    ): Promise<{ exists: boolean }> {
        return await client
            .send(
                new DescribeStacksCommand({
                    StackName: stackName,
                }),
            )
            .then(async (stack) => {
                if (stack.Stacks?.length === 0) {
                    return { exists: false };
                } else {
                    const status = stack.Stacks?.[0].StackStatus;
                    // If the stack is in ROLLBACK_COMPLETE status, we need to delete it. A stack in the ROLLBACK_COMPLETE state does not really exists.
                    if (status === "ROLLBACK_COMPLETE") {
                        debugLogger.debug("Stack in ROLLBACK_COMPLETE state. Deleting it...");
                        await client.send(
                            new DeleteStackCommand({
                                StackName: stackName,
                            }),
                        );
                        await waitUntilStackDeleteComplete(
                            {
                                client: client,
                                maxWaitTime: 360,
                            },
                            {
                                StackName: stackName,
                            },
                        );

                        return { exists: false };
                    }

                    return { exists: true };
                }
            })
            .catch((e) => {
                if (e.message === "Stack with id " + stackName + " does not exist") {
                    return { exists: false };
                }

                throw e;
            });
    }

    async #uploadFileToS3(client: S3, bucket: string, key: string, path: string): Promise<void> {
        const content = fs.readFileSync(path);
        const entryMimeType = mime.lookup(path);

        if (entryMimeType === false) {
            debugLogger.log(`Skipping file ${path} because it has an unsupported mime type.`);
            return;
        }

        await client.send(
            new PutObjectCommand({
                Body: content,
                Bucket: bucket,
                Key: key,
                ContentType: entryMimeType,
            }),
        );
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

    async #updateStack(
        cloudFormationClient: CloudFormationClient,
        createStackTemplate: string,
        stackName: string,
    ) {
        await cloudFormationClient.send(
            new UpdateStackCommand({
                StackName: stackName,
                TemplateBody: createStackTemplate,
                Capabilities: ["CAPABILITY_IAM"],
            }),
        );
        await waitUntilStackUpdateComplete(
            {
                client: cloudFormationClient,
                maxWaitTime: 360,
            },
            {
                StackName: stackName,
            },
        );
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
            cronParts[0] +
            " " +
            cronParts[1] +
            " " +
            cronParts[2] +
            " " +
            cronParts[3] +
            " " +
            cronParts[4] +
            " *";

        return awsCron;
    }

    #findOutputValue(stackDetails: DescribeStacksCommandOutput, key: string): string | undefined {
        const output = stackDetails.Stacks?.[0].Outputs?.find((output) => output.OutputKey === key);
        return output?.OutputValue;
    }

    async #getValueForKeyFromOutput(
        cloudFormationClient: CloudFormationClient,
        stackName: string,
        key: string,
    ): Promise<string> {
        const bucketStackDetails = await cloudFormationClient.send(
            new DescribeStacksCommand({
                StackName: stackName,
            }),
        );
        const successCloudFormationStatus = [
            "UPDATE_COMPLETE",
            "CREATE_COMPLETE",
            "UPDATE_ROLLBACK_COMPLETE",
        ];
        if (
            !bucketStackDetails["Stacks"] ||
            bucketStackDetails["Stacks"].length === 0 ||
            !bucketStackDetails["Stacks"][0]["StackStatus"] ||
            !successCloudFormationStatus.includes(bucketStackDetails["Stacks"][0]["StackStatus"])
        ) {
            debugLogger.error("Stack does not exists!", JSON.stringify(bucketStackDetails));
            throw new Error(
                "A problem occurred while deploying your application. Please check the status of your CloudFormation stack.",
            );
        }

        const bucketName = this.#findOutputValue(bucketStackDetails, key);
        if (!bucketName) {
            debugLogger.error(
                "Could not find bucket name output in cloud formation describe output.",
                JSON.stringify(bucketStackDetails),
            );
            throw new Error(
                "A problem occurred while deploying your application. Please check the status of your CloudFormation stack.",
            );
        }

        return bucketName;
    }

    #getBackendBucketKey(projectName: string, className: string): string {
        return `genezio-${projectName}/server/lambda-${className}.zip`;
    }

    async deploy(
        input: GenezioCloudInput[],
        projectConfiguration: ProjectConfiguration,
        cloudAdapterOptions: CloudAdapterOptions,
    ): Promise<GenezioCloudOutput> {
        const stage: string = cloudAdapterOptions.stage || "prod";

        const cloudFormationClient = new CloudFormationClient({
            region: projectConfiguration.region,
        });
        const s3Client = new S3({ region: projectConfiguration.region });
        const cloudFormationStage = stage === "prod" ? "" : `-${stage}`;
        const stackName = `genezio-${projectConfiguration.name}${cloudFormationStage}`;
        const { exists } = await this.#checkIfStackExists(cloudFormationClient, stackName);

        const credentials = await s3Client.config.credentials();
        if (!credentials) {
            throw new Error("AWS credentials not found");
        }
        log.info(
            `Deploying your backend project to the account represented by access key ID ${credentials.accessKeyId}...`,
        );

        const apiGatewayResourceName = `ApiGateway${alphanumericString(projectConfiguration.name)}`;
        const apiGatewayName = `${projectConfiguration.name}`;
        const cloudFormationTemplate = new GenezioCloudFormationBuilder();
        cloudFormationTemplate.addResource("GenezioDeploymentBucket", getS3BucketResource());
        cloudFormationTemplate.addResource(
            "GenezioDeploymentBucketPolicy",
            getS3BucketPolicyResource(),
        );
        cloudFormationTemplate.addOutput("GenezioDeploymentBucketName", {
            Ref: "GenezioDeploymentBucket",
        });

        // Check if stack already exists. If it already exists, we need to send a describe-stack command to get the bucket name.
        // If the stack does not exists, we need to first create a stack with just one s3 resource.
        if (!exists) {
            debugLogger.debug("The backend stack does not exists. Creating a new stack...");
            const createStackTemplate = cloudFormationTemplate.build();
            await cloudFormationClient.send(
                new CreateStackCommand({
                    StackName: stackName,
                    TemplateBody: createStackTemplate,
                    Capabilities: ["CAPABILITY_IAM"],
                }),
            );

            await waitUntilStackCreateComplete(
                {
                    client: cloudFormationClient,
                    maxWaitTime: 360,
                },
                {
                    StackName: stackName,
                },
            );
        }
        const bucketName = await this.#getValueForKeyFromOutput(
            cloudFormationClient,
            stackName,
            "GenezioDeploymentBucketName",
        );

        const uploadFilesPromises = input.map(async (inputItem) => {
            if (inputItem.unzippedBundleSize > BUNDLE_SIZE_LIMIT) {
                throw new Error(
                    `Class ${inputItem.name} is too big: ${(
                        inputItem.unzippedBundleSize / 1048576
                    ).toFixed(2)}MB. The maximum size is ${
                        BUNDLE_SIZE_LIMIT / 1048576
                    }MB. Try to reduce the size of your class.`,
                );
            }

            const bucketKey = this.#getBackendBucketKey(projectConfiguration.name, inputItem.name);

            const size = await getFileSize(inputItem.archivePath);
            if (size > BUNDLE_SIZE_LIMIT) {
                throw new Error(
                    `Your class ${inputItem.name} is too big: ${size} bytes. The maximum size is 250MB. Try to reduce the size of your class.`,
                );
            }

            log.info(`Uploading class ${inputItem.name} to S3...`);
            return this.#uploadFileToS3(s3Client, bucketName, bucketKey, inputItem.archivePath);
        });

        await Promise.all(uploadFilesPromises);

        for (const inputItem of input) {
            const classConfiguration = projectConfiguration.classes.find(
                (c) => c.path === inputItem.filePath,
            );
            const bucketKey = this.#getBackendBucketKey(projectConfiguration.name, inputItem.name);
            const lambdaFunctionResourceName = `LambdaFunction${alphanumericString(
                inputItem.name,
            )}`;
            const lambdaFunctionName = `${projectConfiguration.name.toLowerCase()}-${inputItem.name.toLowerCase()}${cloudFormationStage}`;
            const invokePermissionResourceName = `LambdaInvokePermission${alphanumericString(
                inputItem.name,
            )}`;
            const routeResourceName = `Route${alphanumericString(inputItem.name)}`;
            const integrationResourceName = `Integration${alphanumericString(inputItem.name)}`;
            const roleResourceName = `Role${alphanumericString(inputItem.name)}`;

            // Create the LambdaInvokePermission
            cloudFormationTemplate.addResource(
                invokePermissionResourceName,
                getLambdaPermissionResource(lambdaFunctionResourceName, apiGatewayResourceName),
            );

            // Create the route
            classConfiguration?.methods
                .filter((m) => m.type === "http")
                .forEach((m) => {
                    cloudFormationTemplate.addResource(
                        routeResourceName + m.name,
                        getApiGatewayRouteResource(
                            apiGatewayResourceName,
                            `ANY /${inputItem.name}/${m.name}`,
                            integrationResourceName,
                        ),
                    );
                });

            cloudFormationTemplate.addResource(
                routeResourceName,
                getApiGatewayRouteResource(
                    apiGatewayResourceName,
                    `ANY /${inputItem.name}`,
                    integrationResourceName,
                ),
            );

            // Create the integration
            cloudFormationTemplate.addResource(
                integrationResourceName,
                getApiGatewayIntegrationResource(
                    apiGatewayResourceName,
                    lambdaFunctionResourceName,
                ),
            );
            // Create the lambda function
            const runtime = this.#getFunctionRuntime(classConfiguration!.language);
            const latestObjectVersion = (await this.#getLatestObjectVersion(
                s3Client,
                bucketName,
                bucketKey,
            ))!;
            cloudFormationTemplate.addResource(
                lambdaFunctionResourceName,
                getLambdaFunctionResource(
                    lambdaFunctionName,
                    runtime,
                    roleResourceName,
                    bucketName,
                    bucketKey,
                    latestObjectVersion,
                ),
            );
            // Create the lambda execution role
            cloudFormationTemplate.addResource(roleResourceName, getIamRoleResource());

            for (const method of inputItem.methods) {
                if (method.type === "cron") {
                    const cronResourceName = `Cron${alphanumericString(
                        inputItem.name,
                    )}${alphanumericString(method.name)}`;
                    const lambdaPermissionName = `LambdaPermission${alphanumericString(
                        inputItem.name,
                    )}${alphanumericString(method.name)}`;
                    const cronString = this.#cronToAWSCron(method.cronString!);
                    cloudFormationTemplate.addResource(
                        cronResourceName,
                        getEventsRoleResource(
                            `cron(${cronString})`,
                            lambdaFunctionResourceName,
                            `target_id_${method.name}`,
                            `{"genezioEventType": "cron", "cronString": "${cronString}", "methodName": "${method.name}"}`,
                        ),
                    );

                    cloudFormationTemplate.addResource(
                        lambdaPermissionName,
                        getLambdaPermissionForEventsResource(
                            lambdaFunctionResourceName,
                            cronResourceName,
                        ),
                    );
                }
            }
        }

        cloudFormationTemplate.addDefaultResourcesForBackendDeployment(
            apiGatewayResourceName,
            apiGatewayName,
        );
        const templateResult = cloudFormationTemplate.build();

        debugLogger.debug(templateResult);
        // Once we have the template, we can create or update the CloudFormation stack.
        await this.#updateStack(cloudFormationClient, templateResult, stackName);
        const classes = [];
        const apiGatewayUrl = await this.#getValueForKeyFromOutput(
            cloudFormationClient,
            stackName,
            "ApiUrl",
        );

        for (const inputItem of input) {
            classes.push({
                className: inputItem.name,
                methods: inputItem.methods.map((method) => ({
                    name: method.name,
                    type: method.type,
                    cronString: method.cronString,
                    functionUrl: getFunctionUrl(
                        `${apiGatewayUrl}`,
                        method.type,
                        inputItem.name,
                        method.name,
                    ),
                })),
                functionUrl: `${apiGatewayUrl}/${inputItem.name}`,
            });
        }

        return {
            projectEnvId: "",
            classes: classes,
        };
    }

    async deployFrontend(
        projectName: string,
        projectRegion: string,
        frontend: YamlFrontend,
        stage: string,
    ): Promise<string> {
        stage = stage || "prod";

        const cloudFormationClient = new CloudFormationClient({
            region: projectRegion,
        });
        const s3Client = new S3({ region: projectRegion });
        const cloudFormationStage = stage === "prod" ? "" : `-${stage}`;
        const stackName = `genezio-${projectName}-frontend${cloudFormationStage}`;
        const { exists } = await this.#checkIfStackExists(cloudFormationClient, stackName);

        const credentials = await s3Client.config.credentials();
        if (!credentials) {
            throw new Error("AWS credentials not found");
        }
        log.info(
            `Deploying your frontend project to the account represented by access key ID ${credentials.accessKeyId}...`,
        );

        const cloudFormationTemplate = new GenezioCloudFormationBuilder();
        cloudFormationTemplate.addResource(
            "GenezioDeploymentBucket",
            getS3BucketResource(
                {
                    IndexDocument: "index.html",
                    ErrorDocument: "index.html",
                },
                undefined,
                {
                    BlockPublicAcls: false,
                    BlockPublicPolicy: false,
                    IgnorePublicAcls: false,
                    RestrictPublicBuckets: false,
                },
            ),
        );
        cloudFormationTemplate.addResource(
            "GenezioDeploymentBucketPolicy",
            getS3BucketPublicResource("GenezioDeploymentBucket"),
        );
        cloudFormationTemplate.addOutput("GenezioDeploymentBucketName", {
            Ref: "GenezioDeploymentBucket",
        });
        cloudFormationTemplate.addOutput("WebsiteUrl", {
            "Fn::GetAtt": ["GenezioDeploymentBucket", "WebsiteURL"],
        });

        // Check if stack already exists. If it already exists, we need to send a describe-stack command to get the bucket name.
        // If the stack does not exists, we need to first create a stack with just one s3 resource.
        if (!exists) {
            debugLogger.debug("The frontend stack does not exists. Creating a new stack...");
            const createStackTemplate = cloudFormationTemplate.build();
            debugLogger.log(createStackTemplate);
            await cloudFormationClient.send(
                new CreateStackCommand({
                    StackName: stackName,
                    TemplateBody: createStackTemplate,
                    Capabilities: ["CAPABILITY_IAM"],
                }),
            );

            await waitUntilStackCreateComplete(
                {
                    client: cloudFormationClient,
                    maxWaitTime: 360,
                },
                {
                    StackName: stackName,
                },
            );
        }

        const bucketName = await this.#getValueForKeyFromOutput(
            cloudFormationClient,
            stackName,
            "GenezioDeploymentBucketName",
        );

        const promises = (await getAllFilesRecursively(frontend.path)).map((filePath) => {
            const path = filePath.replace(frontend.path, "");
            const bucketKey = path.startsWith("/") ? path.substring(1) : path;
            debugLogger.debug(`Uploading file ${filePath} to S3 with key ${bucketKey}.`);
            return this.#uploadFileToS3(s3Client, bucketName, bucketKey, filePath);
        });

        await Promise.all(promises);

        cloudFormationTemplate.addResource(
            "GenezioCloudFrontDistribution",
            getCloudFrontDistributionResource(bucketName, "GenezioDeploymentBucket"),
        );
        cloudFormationTemplate.addOutput("CloudFrontDistributionURL", {
            "Fn::Sub": "https://${GenezioCloudFrontDistribution.DomainName}",
        });

        const updateStackTemplate = cloudFormationTemplate.build();
        debugLogger.log(updateStackTemplate);
        try {
            await cloudFormationClient.send(
                new UpdateStackCommand({
                    StackName: stackName,
                    TemplateBody: updateStackTemplate,
                    Capabilities: ["CAPABILITY_IAM"],
                }),
            );

            await waitUntilStackUpdateComplete(
                {
                    client: cloudFormationClient,
                    maxWaitTime: 360,
                },
                {
                    StackName: stackName,
                },
            );
        } catch (e) {
            if (e instanceof Error && e.message === "No updates are to be performed.") {
                return await this.#getValueForKeyFromOutput(
                    cloudFormationClient,
                    stackName,
                    "CloudFrontDistributionURL",
                );
            }

            throw e;
        }

        return await this.#getValueForKeyFromOutput(
            cloudFormationClient,
            stackName,
            "CloudFrontDistributionURL",
        );
    }
}

function alphanumericString(input: string): string {
    return input.replace(/[^0-9a-zA-Z]/g, "");
}

function getFunctionUrl(
    baseUrl: string,
    methodType: string,
    className: string,
    methodName: string,
): string {
    if (methodType === "http") {
        return `${baseUrl}/${className}/${methodName}`;
    } else {
        return `${baseUrl}/${className}`;
    }
}
