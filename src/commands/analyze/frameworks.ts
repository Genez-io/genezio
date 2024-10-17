import { log } from "../../utils/logging.js";
import { promises as fs } from "fs";

export interface PackageJSON {
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
}

async function readPackageJson(filePath: string): Promise<PackageJSON | null> {
    if (!filePath.endsWith("package.json")) {
        return null; // Return null if the file is not package.json
    }

    try {
        const fileContent = await fs.readFile(filePath, "utf-8");
        return JSON.parse(fileContent) as PackageJSON;
    } catch (error) {
        log.error("Error reading package.json:", error);
        return null; // Return null if there is an error
    }
}

// Checks if the project is a Next.js component
export async function isNextjsComponent(filePath: string): Promise<boolean> {
    const packageJsonContent = await readPackageJson(filePath);
    return packageJsonContent ? "next" in (packageJsonContent.dependencies || {}) : false;
}

// Checks if the project is a Nuxt component
export async function isNuxtComponent(filePath: string): Promise<boolean> {
    const packageJsonContent = await readPackageJson(filePath);
    return packageJsonContent
        ? "nuxt" in (packageJsonContent.dependencies || {}) ||
              "nuxt" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Nitro component
export async function isNitroComponent(filePath: string): Promise<boolean> {
    const packageJsonContent = await readPackageJson(filePath);
    return packageJsonContent
        ? "nitro" in (packageJsonContent.dependencies || {}) ||
              "nitropack" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a React component
export async function isReactComponent(filePath: string): Promise<boolean> {
    const packageJsonContent = await readPackageJson(filePath);
    return packageJsonContent
        ? "react" in (packageJsonContent.dependencies || {}) ||
              "react" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Vite component
export async function isViteComponent(filePath: string): Promise<boolean> {
    const packageJsonContent = await readPackageJson(filePath);
    return packageJsonContent
        ? "vite" in (packageJsonContent.dependencies || {}) ||
              "vite" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Python component (presence of 'requirements.txt')
export function isPythonComponent(filePath: string): boolean {
    return filePath.endsWith("requirements.txt");
}

// Checks if the project is a Golang component (presence of 'go.mod')
export function isGolangComponent(filePath: string): boolean {
    return filePath.endsWith("go.mod");
}

// Checks if the project is a Docker component (presence of 'Dockerfile')
export function isDockerfileComponent(filePath: string): boolean {
    return filePath.endsWith("Dockerfile");
}
