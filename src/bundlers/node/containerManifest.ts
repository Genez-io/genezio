import {
    CONTAINER_IMAGE_NODE20,
    DEFAULT_NODE_RUNTIME_IMAGE,
    supportedNodeRuntimes,
} from "../../models/projectOptions.js";

export function generateNodeContainerManifest(nodeVersion: string) {
    let nodeVersionImage = DEFAULT_NODE_RUNTIME_IMAGE;
    switch (nodeVersion) {
        case supportedNodeRuntimes[0]:
            nodeVersionImage = CONTAINER_IMAGE_NODE20;
            break;
    }

    return `
FROM ${nodeVersionImage}

# Set the working directory to /app
WORKDIR /app

# Copy files to the container
COPY . .

EXPOSE 8080
# Start the application
CMD ["node", "index.mjs", "8080"]
`;
}
