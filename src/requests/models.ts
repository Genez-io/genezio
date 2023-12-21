import { AstSummaryClassResponse } from "../models/astSummary.js";

export type Status<T = object> =
    | {
          status: "error";
          error: {
              code: number;
              message: string;
          };
      }
    | ({
          status: "ok";
      } & T);

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

export interface ObfuscatedEnvironmentVariable {
    id: string;
    name: string;
    lastAccessedAt: string;
    type: string;
}

export type TemplateCategory = "Backend" | "Frontend";

export interface Template {
    id: string;
    name: string;
    description: string;
    category: TemplateCategory;
    language: string;
    repository: string;
    compatibilityMapping: string | null;
}
