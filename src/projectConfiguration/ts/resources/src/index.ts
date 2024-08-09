/* eslint-disable no-console */
import {
    createEmptyProject,
    CreateEmptyProjectRequest,
    CreateEmptyProjectResponse,
    getProjectDetailsByName,
    GetProjectDetailsResponse,
} from "./requests/project.js";
import {
    createDatabase,
    CreateDatabaseRequest,
    CreateDatabaseResponse,
    getDatabaseByName,
    GetDatabaseResponse,
} from "./requests/database.js";
import {
    AuthProviderDetails,
    getAuthProviders,
    setAuthentication,
    SetAuthenticationRequest,
    SetAuthenticationResponse,
    setAuthProviders,
    SetAuthProvidersRequest,
} from "./requests/authentication.js";
import { AxiosError } from "axios";

export type Region = "us-east-1" | "eu-central-1";
export type DependsOn = { dependsOn: Resource[] };

class Resource {
    constructor(
        public resourceName: string,
        private dependsOn?: DependsOn,
    ) {}
}

export class Project extends Resource {
    public name: string;
    public region: Region;
    public cloudProvider: "genezio-cloud";
    public environment: Record<string, string>;

    public id: string | undefined; /* out */

    constructor(
        resourceName: string,
        options: {
            name: string;
            region: Region;
            cloudProvider?: "genezio-cloud";
            environment?: Record<string, string>;
        },
        dependsOn?: DependsOn,
    ) {
        super(resourceName, dependsOn);

        this.name = options.name;
        this.region = options.region;
        this.cloudProvider = options.cloudProvider ?? "genezio-cloud";
        this.environment = options.environment ?? {};
    }

    async create(): Promise<Project> {
        // Attempt to get the project from cloud if it already exists
        const projectObject = await this.get();
        if (projectObject) {
            this.id = projectObject.project.id;
            return this;
        }

        const request: CreateEmptyProjectRequest = {
            projectName: this.name,
            region: this.region,
            cloudProvider: this.cloudProvider,
            stage: "prod",
        };

        const response: CreateEmptyProjectResponse = await createEmptyProject(request);
        this.id = response.projectId;

        return this;
    }

    private async get(): Promise<GetProjectDetailsResponse | undefined> {
        try {
            const response = await getProjectDetailsByName(this.name);
            return response;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            if ((error as AxiosError) && error.response?.status === 400) {
                // eslint-disable-next-line no-console
                console.log("Project not found - proceeding to create it");
                return undefined;
            }
            throw error;
        }
    }
}

export class Database extends Resource {
    public name: string;
    public project?: { name: string };
    public region: Region;

    public id: string | undefined; /* out */
    public uri: string | undefined; /* out */

    constructor(
        resourceName: string,
        options: {
            name: string;
            project?: { name: string };
            region: Region;
        },
        dependsOn?: DependsOn,
    ) {
        super(resourceName, dependsOn);

        this.name = options.name;
        this.project = options.project;
        this.region = options.region;
    }

    async create(): Promise<Database> {
        // Attempt to get the database from cloud if it already exists
        const databaseObject = await this.get();
        if (databaseObject) {
            this.uri = databaseObject.connectionUrl;
            this.id = databaseObject.id;
            return this;
        }

        const request: CreateDatabaseRequest = {
            name: this.name,
            region: this.region,
            type: "postgres-neon",
        };

        if (!this.project) {
            const response: CreateDatabaseResponse = await createDatabase(request);
            this.uri = response.connectionUrl;
            this.id = response.databaseId;
            return this;
        }

        const projectDetails = await getProjectDetailsByName(this.project.name);

        const projectEnv = projectDetails.project.projectEnvs.find((env) => env.name === "prod");
        if (projectEnv === undefined) {
            throw new Error("Project environment not found");
        }

        const response: CreateDatabaseResponse = await createDatabase(
            request,
            projectDetails.project.id,
            projectEnv.id,
            true,
        );

        this.uri = response.connectionUrl;
        this.id = response.databaseId;
        return this;
    }

    private async get(): Promise<GetDatabaseResponse | undefined> {
        const response = await getDatabaseByName(this.name);
        return response;
    }
}

export class ServerlessFunction extends Resource {
    public name: string;
    public project: { name: string };
    public backendPath: string;
    public path: string;
    public entry: string;
    public handler: string;
    public type: "aws";

    public id: string; /* out */
    public url: string; /* out */

    constructor(
        resourceName: string,
        options: {
            project: { name: string };
            name: string;
            backendPath: string;
            path: string;
            entry: string;
            handler: string;
            type?: "aws";
        },
        dependsOn?: DependsOn,
    ) {
        super(resourceName, dependsOn);

        this.name = options.name;
        this.project = options.project;
        this.backendPath = options.backendPath;
        this.path = options.path;
        this.entry = options.entry;
        this.handler = options.handler;
        this.type = options.type ?? "aws";

        // TODO: Deploy and populate outs
        this.id = "TODO";
        this.url = "TODO";
    }

    async create() {
        // TODO Bundle the function code - how to delegate this to the cli
        // TODO Upload it to S3 - how to delegate this to the cli
        // TODO Make a request to deploy it - make the request here
    }
}

export class Frontend extends Resource {
    public project: { name: string };
    public path: string;
    public environment: Record<string, string>;
    public publish?: string;
    public subdomain: string;

    public url: string; /* out */

    constructor(
        resourceName: string,
        options: {
            project: { name: string };
            path: string;
            environment?: Record<string, string>;
            publish?: string;
            subdomain?: string;
        },
        dependsOn?: DependsOn,
    ) {
        super(resourceName, dependsOn);

        this.project = options.project;
        this.path = options.path;
        this.environment = options.environment ?? {};
        this.publish = options.publish;
        this.subdomain = options.subdomain ?? "random-subdomain";

        // TODO: Deploy and populate outs
        this.url = "TODO";
    }
}

export class Authentication extends Resource {
    public project: { name: string };
    public database: { name: string; region: Region } | { dbUri: string };
    public providers?: {
        email?: boolean;
        google?: {
            id: string;
            secret: string;
        };
        web3?: boolean;
    };

    public authToken: string | undefined; /* out */

    constructor(
        resourceName: string,
        options: {
            project: { name: string };
            database: { name: string; region: Region } | { dbUri: string };
            providers?: {
                email?: boolean;
                google?: {
                    id: string;
                    secret: string;
                };
                web3?: boolean;
            };
        },
        dependsOn?: DependsOn,
    ) {
        super(resourceName, dependsOn);

        this.project = options.project;
        this.database = options.database;
        this.providers = options.providers;
    }

    async create(): Promise<SetAuthenticationResponse> {
        // Create the authentication request
        const setAuthRequest: SetAuthenticationRequest = {
            enabled: true,
            databaseType: "postgres",
            databaseUrl: "",
        };

        // Call the setAuthentication method
        const createAuthenticationResponse = await setAuthentication(
            this.project.name,
            setAuthRequest,
        );

        // Call the getAuthProviders method to retrieve the current authentication providers
        const authProvidersResponse = await getAuthProviders(this.project.name);

        const providersDetails: AuthProviderDetails[] = [];

        if (this.providers) {
            for (const provider of authProvidersResponse.authProviders) {
                switch (provider.name) {
                    case "email":
                        if (this.providers.email) {
                            providersDetails.push({
                                id: provider.id,
                                name: provider.name,
                                enabled: true,
                                config: {},
                            });
                        }
                        break;
                    case "web3":
                        if (this.providers.web3) {
                            providersDetails.push({
                                id: provider.id,
                                name: provider.name,
                                enabled: true,
                                config: {},
                            });
                        }
                        break;
                    case "google":
                        if (this.providers.google) {
                            providersDetails.push({
                                id: provider.id,
                                name: provider.name,
                                enabled: true,
                                config: {
                                    GNZ_AUTH_GOOGLE_ID: this.providers.google.id,
                                    GNZ_AUTH_GOOGLE_SECRET: this.providers.google.secret,
                                },
                            });
                        }
                        break;
                }
            }

            // If providers details are updated, call the setAuthProviders method
            if (providersDetails.length > 0) {
                const setAuthProvidersRequest: SetAuthProvidersRequest = {
                    authProviders: providersDetails,
                };
                await setAuthProviders(this.project.name, setAuthProvidersRequest);
            }
        }

        return createAuthenticationResponse;
    }
}
