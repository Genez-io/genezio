export type NodeRuntime = "nodejs16.x" | "nodejs18.x" | "nodejs20.x";
export const DEFAULT_NODE_RUNTIME: NodeRuntime = "nodejs20.x";
export type NodeOptions = {
    nodeRuntime: NodeRuntime;
};
export const supportedNodeRuntimes = ["nodejs16.x", "nodejs18.x", "nodejs20.x"] as const;
