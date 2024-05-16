export type NodeRuntime = "nodejs20.x";
export type Architecture = "arm64" | "x86_64";
export const DEFAULT_NODE_RUNTIME: NodeRuntime = "nodejs20.x";
export const DEFAULT_ARCHITECTURE: Architecture = "arm64";

export const CONTAINER_IMAGE_NODE20 = "node:20.11.1-alpine3.19";

export const DEFAULT_NODE_RUNTIME_IMAGE = CONTAINER_IMAGE_NODE20;

export type NodeOptions = {
    nodeRuntime: NodeRuntime;
    architecture: Architecture;
};

export const supportedNodeRuntimes = ["nodejs20.x"] as const;
export const supportedArchitectures = ["arm64", "x86_64"] as const;
