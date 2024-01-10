import { vi, describe, beforeEach, test, expect } from "vitest";
import { vol, fs as memfsFs } from "memfs";
import fs from "fs/promises";
import inquirer from "inquirer";
import { genezioCommand } from "../../../src/commands/superGenezio/superGenezio";
import { deployCommand } from "../../../src/commands/deploy";
import { startLocalEnvironment } from "../../../src/commands/local";
import colors from "colors";
import { loginCommand } from "../../../src/commands/login";
import { createNewProject } from "../../../src/commands/superGenezio/createNewProject";

vi.mock("fs", () => {
    return { default: memfsFs };
});
vi.mock("fs/promises", () => {
    return { default: memfsFs.promises };
});
vi.mock("../../../src/commands/deploy", () => {
    return { deployCommand: vi.fn(() => Promise.resolve()) };
});
vi.mock("../../../src/commands/local", () => {
    return { startLocalEnvironment: vi.fn(() => Promise.resolve()) };
});
vi.mock("../../../src/commands/login", () => {
    return { loginCommand: vi.fn(() => Promise.resolve()) };
});
vi.mock("../../../src/commands/superGenezio/createNewProject", () => {
    return { createNewProject: vi.fn(() => Promise.resolve()) };
});

describe("superGenezio", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
    });

    test("detects genezio.yaml and deploys project", async () => {
        // Create environment
        await fs.mkdir(process.cwd(), { recursive: true });
        await fs.writeFile("genezio.yaml", "test");

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock user selecting Deploy
        promptSpy.mockResolvedValueOnce({ command: "deploy" });

        // Run the super command
        await genezioCommand();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            {
                type: "list",
                name: "command",
                message: colors.magenta("Genezio project detected. What would you like to do?"),
                choices: [
                    {
                        name: "Deploy your project (genezio deploy)",
                        value: "deploy",
                    },
                    {
                        name: "Start a Local server (genezio local)",
                        value: "local",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                ],
            },
        ]);

        // Check if the deploy command was called
        expect(deployCommand).toHaveBeenCalledOnce();
    });

    test("detects genezio.yaml and starts local", async () => {
        // Create environment
        await fs.mkdir(process.cwd(), { recursive: true });
        await fs.writeFile("genezio.yaml", "test");

        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock user selecting Local
        promptSpy.mockResolvedValueOnce({ command: "local" });

        // Run the super command
        await genezioCommand();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            {
                type: "list",
                name: "command",
                message: colors.magenta("Genezio project detected. What would you like to do?"),
                choices: [
                    {
                        name: "Deploy your project (genezio deploy)",
                        value: "deploy",
                    },
                    {
                        name: "Start a Local server (genezio local)",
                        value: "local",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                ],
            },
        ]);

        // Check if the local environment was started
        expect(startLocalEnvironment).toHaveBeenCalled();
    });

    test("does not detect genezio.yaml and creates a new project", async () => {
        const promptSpy = vi.spyOn(inquirer, "prompt");

        // Mock user selecting New Project
        promptSpy.mockResolvedValueOnce({ command: "createTemplate" });

        // Run the super command
        await genezioCommand();

        // Check if inquirer.prompt was called with the correct arguments
        expect(promptSpy).toHaveBeenCalledWith([
            {
                type: "list",
                name: "command",
                message: colors.magenta(
                    "Genezio project could not be detected. What would you like to do?",
                ),
                choices: [
                    {
                        name: "Create a new project from a template",
                        value: "createTemplate",
                    },
                    {
                        name: "Cancel operation",
                        value: "cancel",
                    },
                ],
            },
        ]);

        expect(createNewProject).toHaveBeenCalledOnce();
    });
});
