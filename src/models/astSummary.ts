import { InstanceSize, TriggerType } from "../projectConfiguration/yaml/models.js";

export type AstSummaryParam = {
    name: string;
    type: any;
    optional: boolean;
};

export type AstSummaryMethod = {
    name: string;
    type: TriggerType;
    params: AstSummaryParam[];
    returnType: any;
    docString?: string;
};

export type AstSummaryClass = {
    name: string;
    path: string;
    language: string;
    types: any[];
    methods: AstSummaryMethod[];
    docString?: string;
    timeout?: number;
    storageSize?: number;
    instanceSize?: InstanceSize;
    maxConcurrentRequestsPerInstance?: number;
};

export type AstSummary = {
    version: string;
    classes: AstSummaryClass[];
};

export type AstSummaryClassResponse = {
    name: string;
    types: any[];
    methods: AstSummaryMethod[];
    version: string;
    docString?: string;
};
