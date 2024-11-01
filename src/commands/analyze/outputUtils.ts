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
            return JSON.stringify(frameworks);
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
    return `${allFrameworks.join(", ")}`;
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
    const name = config.name
        ? `- **Application Name:** \`${config.name}\``
        : "- **Application Name:** Not specified";
    const region = config.region
        ? `- **Deployment Region:** \`${config.region}\``
        : "- **Deployment Region:** Not specified";

    const formatComponentMarkdown = (
        componentDescription: string,
        componentName: string,
        componentConfig: SSRFrameworkComponent,
    ) => {
        const path = componentConfig.path
            ? `- **Path to ${componentName}:** \`${componentConfig.path}\``
            : "- **Path:** Not specified";
        const packageManager = componentConfig.packageManager
            ? `- **Package manager:** \`${componentConfig.packageManager}\``
            : "- **Package manager:** Not specified";
        const deployScript = componentConfig.scripts?.deploy
            ? `- **Pre-build scripts:** \`${componentConfig.scripts.deploy}\``
            : "- **Pre-build scripts:** None";
        const buildScript = componentConfig.scripts?.build
            ? `- **Build script:** \`${componentConfig.scripts.build}\``
            : "- **Build script:** Not specified";
        const startScript = componentConfig.scripts?.start
            ? `- **Start script:** \`${componentConfig.scripts.start}\``
            : "- **Start script:** Not specified";

        return [
            `### ${componentName} Component`,
            componentDescription,
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
                  "This project includes a Next.js component, a server-rendered React framework for efficient page load times and SEO.",
                  "Next.js",
                  config.nextjs as SSRFrameworkComponent,
              )
            : "",
        config.nuxt
            ? formatComponentMarkdown(
                  "This project includes a Nuxt component, a Vue-based framework optimized for server-side rendering and ease of deployment.",
                  "Nuxt",
                  config.nuxt as SSRFrameworkComponent,
              )
            : "",
        config.nitro
            ? formatComponentMarkdown(
                  "This project includes a Nitro component, a versatile framework for server-rendered applications.",
                  "Nitro",
                  config.nitro as SSRFrameworkComponent,
              )
            : "",
    ]
        .filter(Boolean)
        .join("\n\n");

    const frontend = config.frontend
        ? "### Frontend Component\nThe project includes a detected React component for client-side rendering."
        : "";

    return [
        "# Genezio Project Architecture Documentation",
        "This document provides an overview of the project's configuration and detected components. It is generated to help understand the structure and deployment setup of the project.",
        "## Application Details",
        name,
        region,
        "## Detected Components",
        components,
        frontend,
        GENEZIO_FOOTER,
    ]
        .filter(Boolean)
        .join("\n\n");
}

const GENEZIO_FOOTER = `
<div align="center">
  <a href="https://genezio.com/">
    <p>Built with Genezio with ❤️</p>
    <img alt="Genezio logo" src="https://raw.githubusercontent.com/Genez-io/graphics/main/svg/powered_by_genezio.svg" height="40">
  </a>
</div>
`;
