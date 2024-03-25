import colors from "colors";

export type Template = {
    name: string;
    pkgManager?: "npm" | "yarn" | "pnpm";
    coloring: (str: string) => string;
    hidden?: boolean;
};

/*
 * When adding a new template, make sure a repository with the following link structure exists:
 *
 * https://github.com/Genez-io/${templateId}-backend-starter
 *
 * The `templateId` is the key of the template in the `backendTemplates` object.
 */
export const backendTemplates: Record<string, Template> = {
    ts: {
        name: "TypeScript",
        pkgManager: "npm",
        coloring: colors.blue,
    },
    js: {
        name: "JavaScript",
        pkgManager: "npm",
        coloring: colors.yellow,
    },
    go: {
        name: "Golang (Experimental)",
        coloring: colors.cyan,
    },
    "onboarding-ts": {
        name: "TypeScript for Onboarding",
        pkgManager: "npm",
        coloring: (s) => s,
        hidden: true,
    },
};

/*
 * When adding a new template, make sure a repository with the following link structure exists:
 *
 * https://github.com/Genez-io/${templateId}-frontend-starter
 */
export const frontendTemplates: Record<string, Template | undefined> = {
    "react-ts": {
        name: "React (TypeScript)",
        pkgManager: "npm",
        coloring: colors.blue,
    },
    "react-js": {
        name: "React (JavaScript)",
        pkgManager: "npm",
        coloring: colors.blue,
    },
    "react-native": {
        name: "React Native (TypeScript)",
        pkgManager: "npm",
        coloring: colors.blue,
    },
    "vue-ts": {
        name: "Vue (TypeScript)",
        pkgManager: "npm",
        coloring: colors.green,
    },
    "vue-js": {
        name: "Vue (JavaScript)",
        pkgManager: "npm",
        coloring: colors.green,
    },
    "svelte-ts": {
        name: "Svelte (TypeScript)",
        pkgManager: "npm",
        coloring: colors.red,
    },
    "svelte-js": {
        name: "Svelte (JavaScript)",
        pkgManager: "npm",
        coloring: colors.red,
    },
    "vanilla-js": {
        name: "HTML (Vanilla JS)",
        pkgManager: undefined,
        coloring: colors.yellow,
    },
    flutter: {
        name: "Flutter",
        pkgManager: undefined,
        coloring: colors.magenta,
    },
    "onboarding-react": {
        name: "React (TypeScript) for Onboarding",
        pkgManager: "npm",
        coloring: (s) => s,
        hidden: true,
    },
    none: undefined,
};
