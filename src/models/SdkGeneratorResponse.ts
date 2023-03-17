import { File } from "./genezio-models";

export type AstSummaryParam = {
    name: string;
    type: string;
};

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http"
  }

export type AstSummaryMethod = {
    name: string;
    type: TriggerType;
    params: AstSummaryParam[];
};

export type AstSummaryClass = {
    name: string;
    path: string;
    methods: AstSummaryMethod[];
};

export type AstSummary = {
    version: string;
    classes: AstSummaryClass[];
};

export type SdkGeneratorResponse = {
    files: File[],
    astSummary: AstSummary
  };
