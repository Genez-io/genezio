import fs from "fs";
import { getAuthToken } from "../utils/accounts.js";
import https from "https";
import { OutgoingHttpHeaders } from "http";
import { GENEZIO_NOT_AUTH_ERROR_MSG, UserError } from "../errors.js";

export async function uploadContentToS3(
    presignedURL: string | undefined,
    archivePath: string,
    progress?: (percentage: number) => void,
    userId?: string,
) {
    if (!presignedURL) {
        throw new UserError("Missing presigned URL");
    }

    if (!archivePath) {
        throw new UserError("Missing required parameters");
    }

    // Check if user is authenticated
    const authToken = await getAuthToken();
    if (!authToken) {
        throw new UserError(GENEZIO_NOT_AUTH_ERROR_MSG);
    }

    const fileSize = fs.statSync(archivePath).size;
    // If the file exceeds 5GB, we should not upload it
    if (fileSize > 5 * 1024 * 1024 * 1024) {
        throw new UserError(
            `File with size ${fileSize / 1024 / 1024 / 1024}GB exceeds the limit of 5GB.`,
        );
    }

    const url = new URL(presignedURL);
    const headers: OutgoingHttpHeaders = {
        "Content-Type": "application/octet-stream",
        "Content-Length": fs.statSync(archivePath).size,
    };
    if (userId) {
        headers["x-amz-meta-userid"] = userId;
    }

    const options = {
        hostname: url.hostname,
        path: url.href,
        port: 443,
        method: "PUT",
        headers: headers,
    };

    return await new Promise<void>((resolve, reject) => {
        const req = https.request(options, (res) => {
            // If we don't consume the data, the "end" event will not fire
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            res.on("data", () => {});

            res.on("end", () => {
                resolve();
            });
        });

        req.on("error", (error) => {
            reject(error);
        });

        const { size } = fs.statSync(archivePath);
        const fileStream = fs.createReadStream(archivePath);

        let total = 0;
        fileStream
            .on("data", (data) => {
                total += data.length;
                if (progress) progress(total / size);
            })
            .pipe(req);
    });
}
