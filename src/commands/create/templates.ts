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
    "vanilla-js": {
        name: "HTML (Vanilla JS)",
        pkgManager: undefined,
        coloring: colors.red,
    },
    "onboarding-react": {
        name: "React (TypeScript) for Onboarding",
        pkgManager: "npm",
        coloring: (s) => s,
        hidden: true,
    },
    none: undefined,
};
