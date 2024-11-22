import { SyncCronsRequest, SyncCronsResponse } from "../models/requests.js";
import sendRequest from "../utils/requests.js";

// This request will start all the crons jobs sent in the request body
// and will stop/delete all the crons that are not in the request body
// If the request body is empty, it will stop/delete all the crons
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
