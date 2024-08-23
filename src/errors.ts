import zod from "zod";
import { Language } from "./projectConfiguration/yaml/models.js";
import colors from "colors";

export class UserError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "Oops!";
    }
}

// Constant strings used for output/error messages
export const GENEZIO_NOT_AUTH_ERROR_MSG =
    "You are not logged in or your token is invalid. Please run `genezio login` before running this command.";
export const PORT_ALREADY_USED = function (port: number) {
    return `The port ${port} is already in use. Please use a different port by specifying --port <port> to start your local server.`;
};
export const GENEZIO_NO_CLASSES_FOUND = (language: Language) => {
    let decoratorSyntax = "";
    switch (language) {
        case Language.ts:
        case Language.js:
            decoratorSyntax = "@GenezioDeploy";
            break;
        case Language.go:
            decoratorSyntax = "genezio: deploy";
            break;
        default:
            break;
    }
    let errorMessage: string =
        "You don't have any class or function specified in the genezio.yaml configuration file.";
    if (decoratorSyntax) {
        errorMessage += `\nYou have to mark at least one class from your backend for deployment with the ${decoratorSyntax} decorator, or declare a function in you genezio.yaml. Check out how to do that here https://genezio.com/docs/features/backend-deployment/#code-structure.`;
    }
    return errorMessage;
};
export const GENEZIO_DART_NOT_FOUND = `
Error: Dart not found

Please ensure that Dart is installed and its binary is added to your system's PATH environment variable. You can download and install Dart from the official website: https://dart.dev/get-dart. Once installed, try running the command again.
`;
export const GENEZIO_DARTAOTRUNTIME_NOT_FOUND = `
Error: \`dartaotruntime\` not found

Please ensure that \`dartaotruntime\` is installed and its binary is added to your system's PATH environment variable. Check the Dart documentation for more information: https://dart.dev/get-dart.`;
export const GENEZIO_NO_SUPPORT_FOR_OPTIONAL_DART = `We don't currently support Optional types. We will soon add support for this feature.`;

export const GENEZIO_NO_SUPPORT_FOR_BUILT_IN_TYPE = `Our AST doesn't currently support this specific Dart built-in type. Check the documentation for more details https://genezio.com/docs/programming-languages/dart\n\nPlease add a Github issue to https://github.com/Genez-io/genezio/issues describing your use case for this type or feel free to contribute yourself with an improvement.`;

export const GENEZIO_NOT_ENOUGH_PERMISSION_FOR_FILE = function (filePath: string) {
    return `You don't have enough permissions to access the file ${filePath}. There are two possible solutions:\n1. Add the ${filePath} file to .genezioignore file.\n2. Please adjust the permissions of the file located at ${filePath} to ensure the 'genezio' process has the appropriate access rights.\n`;
};

export const GENEZIO_GIT_NOT_FOUND = `Git is not installed. Please install it and try again.
https://git-scm.com/book/en/v2/Getting-Started-Installing-Git`;

export const GENEZIO_CONFIGURATION_FILE_NOT_FOUND = `The genezio.yaml configuration file was not found. Please execute this command at the root of your project.\nIf you don't have a project yet, you can create one by running the command 'genezio create'.`;

export const GENEZIO_DECORATOR_YAML_OVERLAP = function (overlappingClasses: string[]) {
    const multipleOverlaps = overlappingClasses.length > 1;

    return `${colors.yellow(`Warning:`)} found overlapping declarations in both ${colors.magenta("genezio.yaml")} and decorators for class${multipleOverlaps ? "es" : ""}: ${overlappingClasses.map((c) => colors.red(c || ""))}
Please remove the class${multipleOverlaps ? "es" : ""} from the ${colors.magenta("genezio.yaml")} file to avoid conflicts.`;
};
export const GENEZIO_CLASS_STATIC_METHOD_NOT_SUPPORTED =
    "Static methods are not supported in Genezio classes.";

export const GENEZIO_PLEASE_REPORT_ISSUE =
    "Three was a problem on our side. Please report this issue at https://github.com/genez-io/genezio/issues.";

export const CTA_GITHUB_ISSUE = `If you would like to see this feature added, please open an issue on our GitHub repository: https://github.com/Genez-io/genezio/issues.`;

export const ADD_DATABASE_CONFIG = function (name: string, region: string) {
    return `Database ${name} not found in the genezio.yaml configuration file. Please add it as following:
\`\`\`yaml
services:
  databases:
    - name: ${name}
      region: ${region}
\`\`\` `;
};

function collectIssueMap(e: zod.ZodError, issueMap: Map<string, string[]>) {
    for (const issue of e.issues) {
        if (issue.code === "invalid_union") {
            for (const issueError of issue.unionErrors) {
                collectIssueMap(issueError, issueMap);
            }
        }

        if (issueMap.has(issue.path.join("."))) {
            issueMap.get(issue.path.join("."))?.push(issue.message);
        } else {
            issueMap.set(issue.path.join("."), [issue.message]);
        }
    }
}

export function zodFormatError(e: zod.ZodError) {
    let errorString = "";
    const issueMap = new Map<string, string[]>();

    collectIssueMap(e, issueMap);

    const formErrors = issueMap.get("");
    if (formErrors && formErrors.length > 0) {
        errorString += "Form errors:\n";
        for (const error of formErrors) {
            errorString += `\t- ${error}\n`;
        }
    }

    const fieldErrors = Array.from(issueMap.entries()).filter((entry) => entry[0] !== "");
    for (const [field, errors] of fieldErrors) {
        if (errors === undefined) continue;

        errorString += `Field \`${field}\`:\n`;
        errorString += `\t- ${errors.join("\n\t- ")}\n`;
    }

    return errorString;
}
