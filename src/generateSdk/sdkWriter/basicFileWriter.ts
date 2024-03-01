import { SdkGeneratorResponse } from "../../models/sdkGeneratorResponse.js";
import { writeSdkToDisk } from "../../utils/sdk.js";

export async function basicFileWriter(sdk: SdkGeneratorResponse, path: string) {
    await writeSdkToDisk(sdk, path);
}
