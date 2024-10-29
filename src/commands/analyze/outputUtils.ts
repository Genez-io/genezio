import { RawYamlProjectConfiguration } from "../../projectConfiguration/yaml/v2.js";
import { SSRFrameworkComponent } from "../deploy/command.js";
import { FrameworkReport, SUPPORTED_FORMATS } from "./command.js";

export function report(
    format: string,
    frameworks: FrameworkReport,
    config: RawYamlProjectConfiguration,
): string {
    switch (format) {
        case SUPPORTED_FORMATS.JSON:
            return JSON.stringify(frameworks, null, 2);
        case SUPPORTED_FORMATS.LIST:
            return formatFrameworksSimpleList(frameworks);
        case SUPPORTED_FORMATS.MARKDOWN:
            return prettyMarkdownGenezioConfig(config);
        case SUPPORTED_FORMATS.TEXT:
            return prettyLogGenezioConfig(config);
        default:
            return "";
    }
}

function formatFrameworksSimpleList(frameworks: FrameworkReport): string {
    const allFrameworks = Object.values(frameworks).flat();
    return `Detected: ${allFrameworks.join(", ")}`;
}

// This is a nice-to-have feature that logs the detected configuration in a pretty way
function prettyLogGenezioConfig(config: RawYamlProjectConfiguration): string {
    const name = config.name ? `Application Name: ${config.name}` : "";
    const region = config.region ? `Region: ${config.region}` : "";

    const component = (
        initialDecription: string,
        componentName: string,
        componentConfig: SSRFrameworkComponent,
    ) => {
        const path = componentConfig.path
            ? `Path to ${componentName}: ${componentConfig.path}`
            : "";
        const packageManager = componentConfig.packageManager
            ? `Package manager used: ${componentConfig.packageManager}`
            : "";
        const deployScript = componentConfig.scripts?.deploy
            ? `Scripts run before building: ${componentConfig.scripts.deploy}`
            : "";
        const buildScript = componentConfig.scripts?.build
            ? `Scripts run to build the project: ${componentConfig.scripts.build}`
            : "";
        const startScript = componentConfig.scripts?.start
            ? `Scripts run to start a local environment: ${componentConfig.scripts.start}`
            : "";
        return [initialDecription, path, packageManager, deployScript, buildScript, startScript]
            .filter(Boolean)
            .join("\n  ");
    };

    const components = [
        config.nextjs
            ? component(
                  "We found a Next.js component in your project:",
                  "Next.js",
                  config.nextjs as SSRFrameworkComponent,
              )
            : "",
        config.nuxt
            ? component(
                  "We found a Nuxt component in your project:",
                  "Nuxt",
                  config.nuxt as SSRFrameworkComponent,
              )
            : "",
        config.nitro
            ? component(
                  "We found a Nitro component in your project:",
                  "Nitro",
                  config.nitro as SSRFrameworkComponent,
              )
            : "",
    ]
        .filter(Boolean)
        .join("\n\n");

    // TODO: Improve this message (VITE or CRA, multiple frontend frameworks)
    const frontend = config.frontend ? `We found a React component in your project` : ``;

    const result = [name, region, components, frontend].filter(Boolean).join("\n");

    return result;
}

function prettyMarkdownGenezioConfig(config: RawYamlProjectConfiguration): string {
    const name = config.name ? `**Application Name:** ${config.name}` : "";
    const region = config.region ? `**Region:** ${config.region}` : "";

    const formatComponentMarkdown = (
        initialDescription: string,
        componentName: string,
        componentConfig: SSRFrameworkComponent,
    ) => {
        const path = componentConfig.path
            ? `- **Path to ${componentName}:** ${componentConfig.path}`
            : "";
        const packageManager = componentConfig.packageManager
            ? `- **Package manager used:** ${componentConfig.packageManager}`
            : "";
        const deployScript = componentConfig.scripts?.deploy
            ? `- **Scripts run before building:** ${componentConfig.scripts.deploy}`
            : "";
        const buildScript = componentConfig.scripts?.build
            ? `- **Scripts run to build the project:** ${componentConfig.scripts.build}`
            : "";
        const startScript = componentConfig.scripts?.start
            ? `- **Scripts run to start a local environment:** ${componentConfig.scripts.start}`
            : "";

        return [
            `### ${componentName} Component`,
            initialDescription,
            path,
            packageManager,
            deployScript,
            buildScript,
            startScript,
        ]
            .filter(Boolean)
            .join("\n");
    };

    const components = [
        config.nextjs
            ? formatComponentMarkdown(
                  "We found a Next.js component in your project.",
                  "Next.js",
                  config.nextjs as SSRFrameworkComponent,
              )
            : "",
        config.nuxt
            ? formatComponentMarkdown(
                  "We found a Nuxt component in your project.",
                  "Nuxt",
                  config.nuxt as SSRFrameworkComponent,
              )
            : "",
        config.nitro
            ? formatComponentMarkdown(
                  "We found a Nitro component in your project.",
                  "Nitro",
                  config.nitro as SSRFrameworkComponent,
              )
            : "",
    ]
        .filter(Boolean)
        .join("\n\n");

    const frontend = config.frontend
        ? "### Frontend Component\nWe found a React component in your project."
        : "";

    return ["# Project Architecture", name, region, components, frontend]
        .filter(Boolean)
        .join("\n\n");
}
