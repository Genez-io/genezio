import { AstSummary } from "./astSummary";
import { SdkFileClass } from "./genezioModels";

export type AstSummaryParam = {
    name: string;
    type: string;
};

export enum TriggerType {
    jsonrpc = "jsonrpc",
    cron = "cron",
    http = "http"
  }

export type SdkGeneratorResponse = {
    files: SdkFileClass[],
    astSummary: AstSummary
  };
