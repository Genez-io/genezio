import { AstSummaryClassResponse } from "../models/astSummary.js";

export type Status<T = object> = StatusError | StatusOk<T>;

export type StatusOk<T = object> = { status: "ok" } & T;
export type StatusError = {
    status: "error";
    error: {
        code: number;
        message: string;
    };
};

export interface ProjectListElement {
    id: string;
    name: string;
    region: string;
    cloudProvider: string;
    createdAt: number;
    updatedAt: number;
    projectEnvs: ProjectListEnvElement[];
}

export interface ProjectListEnvElement {
    id: string;
    name: string;
}

export interface AuthStatus {
    enabled: boolean;
    databaseUrl: string;
    databaseType: string;
    token: string;
    region: string;
    cloudProvider?: string;
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

export interface SubscriptionLimits {
    maxProjects: number;
    maxInvocations: number;
    executionTime: number;
    maxConcurrency: number;
    maxCollaborators: number;
}

export interface OnboardingInfo {
    onboardingComplete: boolean;
    role: string;
    programmingLanguages: string[];
    experienceLevel: string;
}

export interface UserPayload {
    id: string;
    email: string;
    name: string;
    profileUrl: string;
    subscriptionPlan: string;
    subscriptionPrice: string;
    memberSince: string;
    subscriptionLimits: SubscriptionLimits;
    customSubscription: boolean;
    onboardingInfo: OnboardingInfo;
}
