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

export async function getEntryfile(contents: Record<string, string>): Promise<string> {
    if (!contents["package.json"]) {
        return "index.mjs";
    }

    // TODO Improve this - the entry file might not be defined in the package.json
    // and it's not necessarily `index.mjs`, might be index.cjs, app.mjs, etc.
    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent.main || "index.mjs";
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

// Checks if the project is a Next.js component
// `contents` is a map of important file paths and their contents
export async function isNextjsComponent(contents: Record<string, string>): Promise<boolean> {
    if (!contents["package.json"]) {
        return false;
    }

    const packageJsonContent = JSON.parse(contents["package.json"]) as PackageJSON;
    return packageJsonContent ? "next" in (packageJsonContent.dependencies || {}) : false;
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
    return packageJsonContent
        ? "react" in (packageJsonContent.dependencies || {}) ||
              "react" in (packageJsonContent.devDependencies || {})
        : false;
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

// Checks if the project is a Python component (presence of 'requirements.txt')
// `contents` is a map of important file paths and their contents
export function isPythonComponent(contents: Record<string, string>): boolean {
    if (!contents["requirements.txt"]) {
        return false;
    }

    const requirementsTxt = contents["requirements.txt"];
    return requirementsTxt !== undefined;
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
    if (!contents["requirements.txt"]) {
        return false;
    }
    const requirementsTxt = contents["requirements.txt"];
    return requirementsTxt !== undefined && requirementsTxt.includes("flask");
}

// Checks if the project is a Django component (presence of 'requirements.txt', and 'django' in 'requirements.txt')
export function isDjangoComponent(contents: Record<string, string>): boolean {
    if (!contents["requirements.txt"]) {
        return false;
    }
    const requirementsTxt = contents["requirements.txt"];
    return requirementsTxt !== undefined && requirementsTxt.includes("django");
}

// Checks if the project is a FastAPI component (presence of 'requirements.txt', and 'fastapi' in 'requirements.txt')
export function isFastAPIComponent(contents: Record<string, string>): boolean {
    if (!contents["requirements.txt"]) {
        return false;
    }
    const requirementsTxt = contents["requirements.txt"];
    return requirementsTxt !== undefined && requirementsTxt.includes("fastapi");
}

// Checks if the project is a Python function that is compatible with AWS Lambda (presence of 'requirements.txt' and have a file with 'def handler(event):')
export function isPythonLambdaFunction(contents: Record<string, string>): boolean {
    if (!contents["requirements.txt"]) {
        return false;
    }
    const requirementsTxt = contents["requirements.txt"];
    return (
        requirementsTxt !== undefined &&
        Object.values(contents).some((file) => file.includes("def handler(event):"))
    );
}
