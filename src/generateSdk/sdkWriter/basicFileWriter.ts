import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";
import { writeSdkToDisk } from "../../utils/sdk.js";

export async function basicFileWriter(sdk: SdkGeneratorResponse, path: string): Promise<string> {
    await writeSdkToDisk(sdk, path);

    return path
}
