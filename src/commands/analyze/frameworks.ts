export interface PackageJSON {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
}

// Checks if the project is a Next.js component
// `contents` is a map of important file paths and their contents
export async function isNextjsComponent(contents: Record<string, string>): Promise<boolean> {
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent ? "next" in (packageJsonContent.dependencies || {}) : false;
}

// Checks if the project is a Nuxt component
// `contents` is a map of important file paths and their contents
export async function isNuxtComponent(contents: Record<string, string>): Promise<boolean> {
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "nuxt" in (packageJsonContent.dependencies || {}) ||
              "nuxt" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Nitro component
// `contents` is a map of important file paths and their contents
export async function isNitroComponent(contents: Record<string, string>): Promise<boolean> {
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "nitro" in (packageJsonContent.dependencies || {}) ||
              "nitropack" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a React component
// `contents` is a map of important file paths and their contents
export async function isReactComponent(contents: Record<string, string>): Promise<boolean> {
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "react" in (packageJsonContent.dependencies || {}) ||
              "react" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Vite component
// `contents` is a map of important file paths and their contents
export async function isViteComponent(contents: Record<string, string>): Promise<boolean> {
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "vite" in (packageJsonContent.dependencies || {}) ||
              "vite" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Python component (presence of 'requirements.txt')
// `contents` is a map of important file paths and their contents
export function isPythonComponent(contents: Record<string, string>): boolean {
    const requirementsTxt = contents["requirements.txt"];
    return requirementsTxt !== undefined;
}

// Checks if the project is a Golang component (presence of 'go.mod')
// `contents` is a map of important file paths and their contents
export function isGolangComponent(contents: Record<string, string>): boolean {
    const goMod = contents["go.mod"];
    return goMod !== undefined;
}

// Checks if the project is a Docker component (presence of 'Dockerfile')
// `contents` is a map of important file paths and their contents
export function isDockerfileComponent(contents: Record<string, string>): boolean {
    const dockerfile = contents["Dockerfile"];
    return dockerfile !== undefined;
}
