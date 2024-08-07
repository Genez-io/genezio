import { generateRandomSubdomain } from "../../../../utils/yaml.js";

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

    public id: string; /* out */

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

        // TODO: Deploy and populate outs
        this.id = "TODO";
    }
}

export class Database extends Resource {
    public name: string;
    public project?: { name: string };
    public region: Region;

    public uri: string; /* out */

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

        // TODO: Deploy and populate outs
        this.uri = "TODO";
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
        this.subdomain = options.subdomain ?? generateRandomSubdomain();

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

    public authToken: string; /* out */

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

        // TODO: Deploy and populate outs
        this.authToken = "TODO";
    }
}
