export const node16image = "node:16.20.2-alpine3.18";
export const node18image = "node:18.19.0-alpine";

export function generateNodeContainerManifest(nodeversion: string) {
    if (nodeversion !== "16" && nodeversion !== "18") {
        nodeversion = node16image;
    }

    if (nodeversion === "16") {
        nodeversion = node16image;
    }

    if (nodeversion === "18") {
        nodeversion = node18image;
    }

    return `
FROM ${nodeversion}

# Set the working directory to /app
WORKDIR /app

# Copy the local.mjs file to the container
COPY . .

EXPOSE 8080
# Start the application
CMD ["node", "local.mjs", "8080"]
`;
}
