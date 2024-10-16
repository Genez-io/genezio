import { entryFileFunctionMap, Language } from "../projectConfiguration/yaml/models.js";

export function getFunctionEntryFilename(language: Language, filename: string): string {
    const extension =
        entryFileFunctionMap[language as keyof typeof entryFileFunctionMap].split(".")[1];
    return `${filename}.${extension}`;
}
