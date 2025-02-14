export type NodeRuntime = "nodejs20.x";
export type PythonRuntime =
    | "python3.9.x"
    | "python3.10.x"
    | "python3.11.x"
    | "python3.12.x"
    | "python3.13.x";
export type Architecture = "arm64" | "x86_64";
export const DEFAULT_NODE_RUNTIME: NodeRuntime = "nodejs20.x";
export const DEFAULT_ARCHITECTURE: Architecture = "x86_64";
export const DEFAULT_PYTHON_RUNTIME: PythonRuntime = "python3.13.x";
export const DEFAULT_PYTHON_VERSION_INSTALL: string = "3.13";

export const CONTAINER_IMAGE_NODE20 = "node:20.11.1-alpine3.19";

export const DEFAULT_NODE_RUNTIME_IMAGE = CONTAINER_IMAGE_NODE20;

// Note: ts and tsx are not included in the list of FUNCTION_EXTENSIONS intentionally
// A typescript function will be compiled to javascript before being deployed
export const FUNCTION_EXTENSIONS = ["js", "mjs", "cjs", "py", "ts"];

export type NodeOptions = {
    nodeRuntime: NodeRuntime;
    architecture: Architecture;
};

export type PythonOptions = {
    pythonRuntime: PythonRuntime;
    architecture: Architecture;
};

export enum SSRFrameworkComponentType {
    next = "nextjs",
    nitro = "nitro",
    nuxt = "nuxt",
    nestjs = "nestjs",
    remix = "remix",
    streamlit = "streamlit",
}

// These are the human friendly names for the SSR frameworks
// They can be used for displaying prettify logs
export const SSRFrameworkName: Record<SSRFrameworkComponentType, string> = {
    [SSRFrameworkComponentType.next]: "Next.js",
    [SSRFrameworkComponentType.nitro]: "Nitro",
    [SSRFrameworkComponentType.nuxt]: "Nuxt.js",
    [SSRFrameworkComponentType.nestjs]: "NestJS",
    [SSRFrameworkComponentType.remix]: "Remix",
    [SSRFrameworkComponentType.streamlit]: "Streamlit",
};

export enum ContainerComponentType {
    container = "container",
}

export const supportedNodeRuntimes = ["nodejs20.x"] as const;
export const supportedPythonRuntimes = [
    "python3.9.x",
    "python3.10.x",
    "python3.11.x",
    "python3.12.x",
    "python3.13.x",
] as const;

export const supportedArchitectures = ["arm64", "x86_64"] as const;
export const supportedSSRFrameworks = ["nextjs", "nitro", "nuxt", "streamlit"] as const;
export const supportedPythonDepsInstallVersion = ["3.9", "3.10", "3.11", "3.12", "3.13"] as const;
