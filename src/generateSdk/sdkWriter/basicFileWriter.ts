import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";
import { ClassUrlMap, replaceUrlsInSdk, writeSdkToDisk } from "../../utils/sdk.js";

export async function basicFileWriter(sdk: SdkGeneratorResponse, classUrls: ClassUrlMap[], path: string): Promise<string> {
    await replaceUrlsInSdk(
        sdk,
        classUrls,
    );
    await writeSdkToDisk(sdk, path);

    return path
}
