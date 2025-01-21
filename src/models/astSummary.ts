import { InstanceSize, TriggerType } from "../projectConfiguration/yaml/models.js";

export type AstSummaryParam = {
    name: string;
    // eslint-disable-next-line
    type: any;
    optional: boolean;
};

export type AstSummaryMethod = {
    name: string;
    type: TriggerType;
    params: AstSummaryParam[];
    // eslint-disable-next-line
    returnType: any;
    docString?: string;
};

export type AstSummaryClass = {
    name: string;
    path: string;
    language: string;
    // eslint-disable-next-line
    types: any[];
    methods: AstSummaryMethod[];
    docString?: string;
    timeout?: number;
    storageSize?: number;
    instanceSize?: InstanceSize;
    maxConcurrentRequestsPerInstance?: number;
    maxConcurrentInstances?: number;
    cooldownTime?: number;
};

export type AstSummary = {
    version: string;
    classes: AstSummaryClass[];
};

export type AstSummaryClassResponse = {
    name: string;
    path: string;
    // eslint-disable-next-line
    types: any[];
    methods: AstSummaryMethod[];
    version: string;
    docString?: string;
};
