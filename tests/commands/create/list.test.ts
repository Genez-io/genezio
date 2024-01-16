import { describe, test, vi, beforeEach, expect } from "vitest";
import { Template } from "../../../src/requests/models";
import { listCreateTemplates } from "../../../src/commands/create/list";

let printedIds: string[] = [];
const templateList: Template[] = [
    {
        id: "ts-weather-api",
        name: "TypeScript Weather API",
        description: "Simple weather API written in TypeScript",
        category: "Backend",
        language: "TypeScript",
        repository: "https://foo.bar",
        compatibilityMapping: "weather",
    },
    {
        id: "ts-weather-react",
        name: "TypeScript Weather React",
        description: "Simple weather React app written in TypeScript",
        category: "Frontend",
        language: "TypeScript",
        repository: "https://foo.bar",
        compatibilityMapping: "weather",
    },
    {
        id: "static-website",
        name: "Static Website",
        description: "Simple static website",
        category: "Frontend",
        language: "HTML",
        repository: "https://foo.bar",
        compatibilityMapping: null,
    },
    {
        id: "aaa",
        name: "someting bbb something",
        description: "something ccc something",
        category: "Backend",
        language: "Dart",
        repository: "https://foo.bar",
        compatibilityMapping: null,
    },
];

vi.mock("colors", () => {
    return {
        default: {
            yellow: vi.fn((s: string) => s),
            red: vi.fn((s: string) => s),
            magenta: vi.fn((s: string) => s),
            gray: vi.fn((s: string) => s),
            cyan: vi.fn((s: string) => s),
            blue: vi.fn((s: string) => s),
            green: vi.fn((s: string) => s),
            black: vi.fn((s: string) => s),
        },
    };
});
vi.mock("loglevel", () => {
    return {
        default: {
            info: vi.fn((...s: string[]) => {
                const id = s[0].split(" - ")[0];
                printedIds.push(id);
            }),
            getLogger: vi.fn(),
        },
    };
});
vi.mock("../../../src/requests/getTemplateList", () => {
    return {
        getNewProjectTemplateList: vi.fn(() => Promise.resolve<Template[]>(templateList)),
    };
});

describe("listCreateTemplates", () => {
    beforeEach(() => {
        printedIds = [];
    });

    test("should list all templates", async () => {
        await listCreateTemplates();
        expect(printedIds.sort()).toEqual(templateList.map((t) => t.id).sort());
    });

    test("should filter by id", async () => {
        await listCreateTemplates("ts-weather-api");
        expect(printedIds).toEqual(["ts-weather-api"]);
    });

    test("should filter by name", async () => {
        await listCreateTemplates("bbb");
        expect(printedIds).toEqual(["aaa"]);
    });

    test("should filter by description", async () => {
        await listCreateTemplates("ccc");
        expect(printedIds).toEqual(["aaa"]);
    });

    test("should filter by category", async () => {
        await listCreateTemplates("backend");
        expect(printedIds.sort()).toEqual(["aaa", "ts-weather-api"].sort());
    });

    test("should filter by language", async () => {
        await listCreateTemplates("dart");
        expect(printedIds).toEqual(["aaa"]);
    });

    test("should filter by compatibility fullstack", async () => {
        await listCreateTemplates("fullstack");
        expect(printedIds.sort()).toEqual(["ts-weather-api", "ts-weather-react"].sort());
    });

    test("should filter by compatibility standalone", async () => {
        await listCreateTemplates("standalone");
        expect(printedIds.sort()).toEqual(["static-website", "aaa"].sort());
    });

    test("is case insensitive", async () => {
        await listCreateTemplates("dArT");
        expect(printedIds).toEqual(["aaa"]);
    });
});
