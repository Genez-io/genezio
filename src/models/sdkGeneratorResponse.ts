import { AstSummary } from "./astSummary";
import { SdkFileClass } from "./genezioModels";

export type AstSummaryParam = {
    name: string;
    type: string;
};

export type SdkGeneratorResponse = {
    files: SdkFileClass[],
    astSummary: AstSummary
};
