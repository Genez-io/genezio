export type NodeRuntime = "nodejs16.x" | "nodejs18.x";
export const NODEJS_MAJOR_VERSIONS = ["16", "18"];
export const DEFAULT_NODE_RUNTIME: NodeRuntime = "nodejs16.x";
export type NodeOptions = {
    nodeRuntime: NodeRuntime;
}