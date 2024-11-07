import { SyncCronsRequest, SyncCronsResponse } from "../models/requests.js";
import sendRequest from "../utils/requests.js";

export async function syncCrons(request: SyncCronsRequest): Promise<SyncCronsResponse> {
    const { projectName, stageName, crons } = request;

    const data: string = JSON.stringify({
        projectName: projectName,
        stageName: stageName,
        crons: crons,
    });

    const syncCronsResponse = (await sendRequest("POST", `crons`, data)) as SyncCronsResponse;

    return syncCronsResponse;
}
