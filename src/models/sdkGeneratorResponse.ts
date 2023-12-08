import { SdkFileClass, SdkGeneratorInput } from "./genezioModels.js";

export type AstSummaryParam = {
    name: string;
    type: string;
};

export type SdkGeneratorResponse = {
    files: SdkFileClass[];
    sdkGeneratorInput: SdkGeneratorInput;
};
