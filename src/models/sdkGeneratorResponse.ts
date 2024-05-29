import { SdkFileClass, SdkGeneratorClassesInfoInput, SdkGeneratorInput } from "./genezioModels.js";

export type AstSummaryParam = {
    name: string;
    type: string;
};

export type SdkGeneratorResponse = {
    files: SdkFileClass[];
    sdkGeneratorInput: SdkGeneratorInput;
};

export type SdkHandlerResponse = {
    generatorResponses: SdkGeneratorResponse[];
    classesInfo: SdkGeneratorClassesInfoInput[];
};
