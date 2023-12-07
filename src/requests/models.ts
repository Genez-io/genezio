import { AstSummaryClassResponse } from "../models/astSummary.js";

export interface ProjectListElement {
    id: string;
    name: string;
    region: string;
    createdAt: number;
    updatedAt: number;
    projectEnvs: ProjectListEnvElement[];
}

export interface ProjectListEnvElement {
    id: string;
    name: string;
}

export interface ProjectDetails {
    id: string;
    name: string;
    region: string;
    createdAt: number;
    updatedAt: number;
    projectEnvs: ProjectDetailsEnvElement[];
}

export interface ProjectDetailsEnvElement {
    id: string;
    name: string;
    classes: ClassDetails[];
}

export interface ClassDetails {
    id: string;
    name: string;
    projectName: string;
    status: string;
    ast: AstSummaryClassResponse;
    cloudUrl: string;
    createdAt: number;
    updatedAt: number;
}
