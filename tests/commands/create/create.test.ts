import { vol, fs as memfsFs, IFs } from "memfs";
import path from "path";
import { describe, test, vi, beforeEach, expect } from "vitest";
import { regions } from "../../../src/utils/configs";
import { createCommand } from "../../../src/commands/create/create";
import { GenezioCreateOptions } from "../../../src/models/commandOptions";
import { setLinkPathForProject } from "../../../src/utils/linkDatabase";

vi.mock("fs", () => {
    return { default: memfsFs };
});
vi.mock("fs/promises", () => {
    return { default: memfsFs.promises };
});
vi.mock("isomorphic-git", async (original) => {
    const git: {} = await original();
    return {
        default: {
            ...git,
            clone: vi.fn((args: { fs: IFs; dir: string }) => {
                args.fs.mkdirSync(path.join(args.dir, ".git"), { recursive: true });
                args.fs.writeFileSync(
                    path.join(args.dir, "genezio.yaml"),
                    "name: test\nyamlVersion: 2",
                );
            }),
            checkout: vi.fn(() => Promise.resolve()),
        },
    };
});
vi.mock("../../../src/requests/getTemplateList", () => {
    return {
        getNewProjectTemplateList: vi.fn(() =>
            Promise.resolve([
                {
                    id: "backendId",
                    compatibilityMapping: "test",
                    repository: "backendURL",
                    category: "Backend",
                    language: "TypeScript",
                },
                {
                    id: "backendId2",
                    compatibilityMapping: "test",
                    repository: "backendURL",
                    category: "Backend",
                    language: "TypeScript",
                },
                {
                    id: "backendId3",
                    compatibilityMapping: "test2",
                    repository: "backendURL",
                    category: "Backend",
                    language: "JavaScript",
                },
                {
                    id: "frontendId",
                    compatibilityMapping: "test",
                    repository: "frontendURL",
                    category: "Frontend",
                    language: "TypeScript",
                },
                {
                    id: "frontendId2",
                    compatibilityMapping: "test",
                    repository: "frontendURL",
                    category: "Frontend",
                    language: "TypeScript",
                },
                {
                    id: "frontendId3",
                    compatibilityMapping: "test",
                    repository: "frontendURL",
                    category: "Frontend",
                    language: "JavaScript",
                },
            ]),
        ),
    };
});
vi.mock("../../../src/utils/linkDatabase");

describe("create", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
    });

    test("throws error if project folder already exists", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd(), "genezio-project"), { recursive: true });
        vol.writeFileSync(path.join(process.cwd(), "genezio-project", "genezio.yaml"), "test");

        const options: GenezioCreateOptions = {
            name: "genezio-project",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: false,
        };

        // Run the super command
        expect(createCommand(options)).rejects.toThrowError(
            "You can't create a project in a non-empty folder",
        );
    });

    test("does not throw error if project folder exists, but contains only README/.git", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd(), "genezio-project/.git"), { recursive: true });
        vol.writeFileSync(path.join(process.cwd(), "genezio-project", "README"), "test");
        vol.writeFileSync(path.join(process.cwd(), "genezio-project", "README.md"), "test");
        vol.writeFileSync(path.join(process.cwd(), "genezio-project", ".gitignore"), "test");
        vol.writeFileSync(path.join(process.cwd(), "genezio-project", "LICENSE"), "test");

        const options: GenezioCreateOptions = {
            name: "genezio-project",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: false,
        };

        // Run the super command
        expect(createCommand(options)).resolves.toBeUndefined();
    });

    test("throws on invalid project name", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd(), "genezio-project"), { recursive: true });

        const options: GenezioCreateOptions = {
            name: "@gnz",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: false,
        };

        // Run the super command
        expect(createCommand(options)).rejects.toThrowError(
            "Project name must start with a letter and contain only letters, numbers and dashes",
        );
    });

    test("creates a new fullstack monorepo project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const options: GenezioCreateOptions = {
            name: "genezio-project",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: false,
        };

        await createCommand(options);

        // Project folder should be created
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project"))).toBe(true);
        // The project folder should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", ".git"))).toBe(true);
        // The project folder should have a genezio.yaml file
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "genezio.yaml"))).toBe(
            true,
        );

        // Client has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "client"))).toBe(true);
        // Client should not have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "client", "genezio.yaml")),
        ).toBe(false);

        // Server has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "server"))).toBe(true);
        // Server should not have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "server", "genezio.yaml")),
        ).toBe(false);
    });

    test("creates a new fullstack multirepo project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const options: GenezioCreateOptions = {
            name: "genezio-project",
            region: regions[0].value,
            type: "fullstack",
            backend: "ts",
            frontend: "react-ts",
            multirepo: true,
        };

        await createCommand(options);

        expect(setLinkPathForProject).toHaveBeenCalled();

        // Project folder should be created
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project"))).toBe(true);

        // Client has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "client"))).toBe(true);
        // Client should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "client", ".git"))).toBe(
            true,
        );
        // Client should have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "client", "genezio.yaml")),
        ).toBe(true);

        // Server has been cloned
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "server"))).toBe(true);
        // Server should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "server", ".git"))).toBe(
            true,
        );
        // Server should have a genezio.yaml file
        expect(
            vol.existsSync(path.join(process.cwd(), "genezio-project", "server", "genezio.yaml")),
        ).toBe(true);
    });

    test("creates a new backend project", async () => {
        // Create environment
        vol.mkdirSync(path.join(process.cwd()), { recursive: true });

        const options: GenezioCreateOptions = {
            name: "genezio-project",
            region: regions[0].value,
            type: "backend",
            backend: "ts",
        };

        await createCommand(options);

        // Project folder should be created
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project"))).toBe(true);

        // Project folder should have a .git folder
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", ".git"))).toBe(true);
        // Project folder should have a genezio.yaml file
        expect(vol.existsSync(path.join(process.cwd(), "genezio-project", "genezio.yaml"))).toBe(
            true,
        );
    });
});
