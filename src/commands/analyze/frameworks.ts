import { promises as fs } from "fs";
import path from "path";
import { EXCLUDED_DIRECTORIES, KEY_DEPENDENCY_FILES } from "./command.js";
import { FUNCTION_EXTENSIONS } from "../../models/projectOptions.js";
import { debugLogger } from "../../utils/logging.js";

export interface PackageJSON {
    name?: string;
    version?: string;
    main?: string;
    description?: string;
    scripts?: { [key: string]: string };
    dependencies?: { [key: string]: string };
    devDependencies?: { [key: string]: string };
}

export interface TsconfigJSON {
    compilerOptions: {
        target: string;
        module: string;
    };
}

export async function isTypescript(contents: Record<string, string>): Promise<boolean> {
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    const tsconfigJsonContent = JSON.parse(contents["tsconfig.json"]) as TsconfigJSON;

    // If there is no package.json, the language is not ts, nor js
    if (!packageJsonContent) {
        return false;
    }

    if (tsconfigJsonContent) {
        return true;
    }

    if (packageJsonContent.main && packageJsonContent.main.endsWith(".ts")) {
        return true;
    }

    return false;
}

// We try to find the entry file of the component by checking the following:
// 1. Check if the component has a main file in package.json
// 2. Check if the component has a file that matches the patterns
// 3. Return the default file
export async function findEntryFile(
    componentPath: string,
    contents: Record<string, string>,
    patterns: RegExp[],
    defaultFile: string,
): Promise<string> {
    const candidateFile = await getEntryFileFromPackageJson(componentPath, contents);
    if (candidateFile) {
        return candidateFile;
    }

    const entryFile = await findFileByPatterns(componentPath, patterns, FUNCTION_EXTENSIONS);
    if (entryFile) {
        return path.relative(componentPath, entryFile);
    }

    return defaultFile;
}

async function findFileByPatterns(
    directory: string,
    patterns: RegExp[],
    extensions: string[],
): Promise<string | undefined> {
    const entries = await fs.readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);

        if (entry.isDirectory()) {
            // Skip excluded directories
            if (EXCLUDED_DIRECTORIES.includes(entry.name)) continue;

            // Recursively search within subdirectories
            const result = await findFileByPatterns(fullPath, patterns, extensions);
            if (result) return result;
        } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(`.${ext}`))) {
            // Check if the file content matches all given patterns
            const content = await fs.readFile(fullPath, "utf-8");
            const allPatternsMatch = patterns.every((pattern) => pattern.test(content));
            if (allPatternsMatch) {
                return fullPath;
            }
        }
    }

    return undefined;
}

// Returns an object containing `candidateFile`: The path to the main file in package.json if it exists.
async function getEntryFileFromPackageJson(
    directory: string,
    contents: Record<string, string>,
): Promise<string | undefined> {
    if (!contents["package.json"]) {
        return undefined;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    const mainPath = packageJsonContent.main;
    if (!mainPath) {
        return undefined;
    }
    const fullPath = path.join(directory, mainPath);

    try {
        if (fullPath) await fs.access(fullPath);
        return mainPath;
    } catch {
        debugLogger.debug(`File ${fullPath} does not exist`);
        return undefined;
    }
}

export async function hasPostgresDependency(
    contents: Record<string, string>,
    dependencyFile: string,
): Promise<boolean> {
    if (!KEY_DEPENDENCY_FILES.includes(dependencyFile)) {
        return false;
    }

    if (!contents[dependencyFile]) {
        return false;
    }

    const jsPostgresIndicators = ["pg", "pg-promise", "postgres", "@vercel/postgres"];
    const pythonPostgresIndicators = ["psycopg2", "asyncpg", "py-postgresql"];
    const dependencyList = jsPostgresIndicators.concat(pythonPostgresIndicators);

    return await searchDependency(contents, dependencyFile, dependencyList);
}

export async function hasMongoDependency(
    contents: Record<string, string>,
    dependencyFile: string,
): Promise<boolean> {
    if (!KEY_DEPENDENCY_FILES.includes(dependencyFile)) {
        return false;
    }

    if (!contents[dependencyFile]) {
        return false;
    }

    const jsMongoIndicators = ["mongodb", "mongoose", "connect-mongo"];
    const pythonMongoIndicators = ["pymongo"];
    const dependencyList = jsMongoIndicators.concat(pythonMongoIndicators);

    return await searchDependency(contents, dependencyFile, dependencyList);
}

/**
 * This function receives a dependency file such as package.json or requirements.txt
 * and a list of dependency such as ["mongodb", "mongoose", "connect-mongo"].
 *
 * It returns true if any of the dependencies are found in the file.
 *
 * This is used to determine if a project is using certain services such as Postgres or MongoDB
 * Can be used for other services too - redis, mysql, kafka etc.
 */
export async function searchDependency(
    contents: Record<string, string>,
    dependencyFile: string,
    dependencyList: string[],
): Promise<boolean> {
    if (!contents[dependencyFile]) {
        return false;
    }

    if (dependencyFile === "package.json") {
        const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
        return dependencyList.some(
            (indicator) =>
                indicator in (packageJsonContent.dependencies || {}) ||
                indicator in (packageJsonContent.devDependencies || {}),
        );
    } else if (dependencyFile === "requirements.txt") {
        const requirementsContent = contents["requirements.txt"];
        return requirementsContent
            .split("\n")
            .some((line) => dependencyList.some((indicator) => line.trim().startsWith(indicator)));
    }

    return false;
}

// Checks if the project is a Express component
// `contents` is a map of important file paths and their contents
export async function isExpressBackend(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    // If the project is a serverless-http backend, it should be treated in a different way
    const isServerlessHttp = "serverless-http" in (packageJsonContent.dependencies || {});
    return packageJsonContent
        ? "express" in (packageJsonContent.dependencies || {}) && !isServerlessHttp
        : false;
}

// Checks if the project is a Fastify component
// `contents` is a map of important file paths and their contents
export async function isFastifyBackend(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    // If the project is a serverless-http backend, it should be treated in a different way
    const isServerlessHttp = "serverless-http" in (packageJsonContent.dependencies || {});
    return packageJsonContent
        ? "fastify" in (packageJsonContent.dependencies || {}) && !isServerlessHttp
        : false;
}

// Checks if the project is a serverless-http component
// `contents` is a map of important file paths and their contents
export async function isServerlessHttpBackend(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "serverless-http" in (packageJsonContent.dependencies || {})
        : false;
}

// Checks if the project is a Genezio Typesafe component
export async function isGenezioTypesafe(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent ? "@genezio/types" in (packageJsonContent.dependencies || {}) : false;
}

// Checks if the project is a Next.js component
// `contents` is a map of important file paths and their contents
export async function isNextjsComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent ? "next" in (packageJsonContent.dependencies || {}) : false;
}

// Checks if the project is a Nest.js component
// `contents` is a map of important file paths and their contents
export async function isNestjsComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent ? "@nestjs/core" in (packageJsonContent.dependencies || {}) : false;
}

// Checks if the project is a Nuxt component
// `contents` is a map of important file paths and their contents
export async function isNuxtComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "nuxt" in (packageJsonContent.dependencies || {}) ||
              "nuxt" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Nitro component
// `contents` is a map of important file paths and their contents
export async function isNitroComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "nitro" in (packageJsonContent.dependencies || {}) ||
              "nitropack" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a React component
// `contents` is a map of important file paths and their contents
export async function isReactComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    const dependencies = packageJsonContent.dependencies || {};
    const devDependencies = packageJsonContent.devDependencies || {};

    // Return false if it's a react-native project
    if ("react-native" in dependencies || "react-native" in devDependencies) {
        return false;
    }

    return "react" in dependencies || "react" in devDependencies;
}

// Checks if the project is a Vite component
// `contents` is a map of important file paths and their contents
export async function isViteComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "vite" in (packageJsonContent.dependencies || {}) ||
              "vite" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Vue component
export async function isVueComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "vue" in (packageJsonContent.dependencies || {}) ||
              "vue" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is an Angular component
export async function isAngularComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "@angular/core" in (packageJsonContent.dependencies || {}) ||
              "@angular/core" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Svelte component
export async function isSvelteComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "svelte" in (packageJsonContent.dependencies || {}) ||
              "svelte" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Remix component
export async function isRemixComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;

    return Object.keys(packageJsonContent.dependencies || {}).some((key) =>
        key.startsWith("@remix-run"),
    );
}

// Checks if the project is an Ember component
export async function isEmberComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent
        ? "ember-cli" in (packageJsonContent.dependencies || {}) ||
              "ember-cli" in (packageJsonContent.devDependencies || {})
        : false;
}

// Checks if the project is a Python component (presence of 'requirements.txt' or 'pyproject.toml')
export function isPythonComponent(contents: Record<string, string>): boolean {
    return contents["requirements.txt"] !== undefined || contents["pyproject.toml"] !== undefined;
}

// Checks if the project is a Golang component (presence of 'go.mod')
// `contents` is a map of important file paths and their contents
export function isGolangComponent(contents: Record<string, string>): boolean {
    if (!contents["go.mod"]) {
        return false;
    }

    const goMod = contents["go.mod"];
    return goMod !== undefined;
}

// Checks if the project is a Docker component (presence of 'Dockerfile')
// `contents` is a map of important file paths and their contents
export function isContainerComponent(contents: Record<string, string>): boolean {
    if (!contents["Dockerfile"]) {
        return false;
    }

    const dockerfile = contents["Dockerfile"];
    return dockerfile !== undefined;
}

// Checks if the project is a Flask component (presence of 'requirements.txt', and 'flask' in 'requirements.txt')
export function isFlaskComponent(contents: Record<string, string>): boolean {
    if (contents["requirements.txt"]) {
        return /flask(?:==|$|\s)/i.test(contents["requirements.txt"]);
    }
    if (contents["pyproject.toml"]) {
        const content = contents["pyproject.toml"];
        return /\bflask\b/i.test(content);
    }
    return false;
}

// Checks if the project is a Django component (presence of 'requirements.txt', and 'django' in 'requirements.txt')
export function isDjangoComponent(contents: Record<string, string>): boolean {
    if (contents["requirements.txt"]) {
        return /django(?:==|$|\s)/i.test(contents["requirements.txt"]);
    }
    if (contents["pyproject.toml"]) {
        const content = contents["pyproject.toml"];
        return /\bdjango\b/i.test(content);
    }
    return false;
}

// Checks if the project is a FastAPI component (presence of 'requirements.txt', and 'fastapi' in 'requirements.txt')
export function isFastAPIComponent(contents: Record<string, string>): boolean {
    if (contents["requirements.txt"]) {
        return /fastapi(?:==|$|\s)/i.test(contents["requirements.txt"]);
    }
    if (contents["pyproject.toml"]) {
        const content = contents["pyproject.toml"];
        return /\bfastapi\b/i.test(content);
    }
    return false;
}

// Check if the project is a FastHTML component (presence of 'requirements.txt', and 'fasthtml' in 'requirements.txt')
export function isFastHTMLComponent(contents: Record<string, string>): boolean {
    if (contents["requirements.txt"]) {
        return /fasthtml(?:==|$|\s)/i.test(contents["requirements.txt"]);
    }
    return false;
}

// Checks if the project is a Python function that is compatible with AWS Lambda (presence of 'requirements.txt')
export function isPythonLambdaFunction(contents: Record<string, string>): boolean {
    return contents["requirements.txt"] !== undefined || contents["pyproject.toml"] !== undefined;
}

// Checks if the project is a Streamlit component (presence of 'requirements.txt' or 'pyproject.toml' and 'streamlit' in 'requirements.txt' or 'pyproject.toml')
export function isStreamlitComponent(contents: Record<string, string>): boolean {
    return (
        (contents["requirements.txt"] !== undefined &&
            contents["requirements.txt"].includes("streamlit")) ||
        (contents["pyproject.toml"] !== undefined &&
            contents["pyproject.toml"].includes("streamlit"))
    );
}
