export type ProjectResponse = {
    id: string;
    name: string;
    region: string;
    createdAt: number;
    updatedAt: number;
    projectEnvs: ProjectEnvResponse[];
};

export type ProjectEnvResponse = {
    id: string;
    name: string;
};
