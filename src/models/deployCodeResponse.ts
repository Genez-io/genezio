export type DeployCodeMethodResponse = {
    name: string;
    type: string;
    cronString?: string;
    functionUrl: string;
};

export type DeployCodeClassResponse = {
    cloudUrl: string;
    name: string;
    path: string;
    type: string;
    methods: DeployCodeMethodResponse[];
};

export type DeployCodeResponse = {
    status: string;
    projectId: string;
    projectEnvId: string;
    classes: DeployCodeClassResponse[];
};
