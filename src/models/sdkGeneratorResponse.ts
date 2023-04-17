import { AstSummary } from "./astSummary";
import { SdkFileClass, SdkGeneratorInput } from "./genezioModels";

export type AstSummaryParam = {
    name: string;
    type: string;
};

export type SdkGeneratorResponse = {
    files: SdkFileClass[],
    sdkGeneratorInput: SdkGeneratorInput,
};
