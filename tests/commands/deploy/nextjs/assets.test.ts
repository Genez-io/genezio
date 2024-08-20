import { vol, fs as memfsFs } from "memfs";
import { beforeEach, describe, expect, test, vi } from "vitest";
import {
    Directory,
    File,
    mergeFsTrees,
    recursivePathGenerator,
    treeFs,
} from "../../../../src/commands/deploy/nextjs/assets";

vi.mock("fs", () => {
    return { default: memfsFs };
});
vi.mock("fs/promises", () => {
    return { default: memfsFs.promises };
});

describe("Filesystem Trees", () => {
    beforeEach(() => {
        // Clean up the mocked file system before each test
        vol.reset();
    });

    test("should merge two fs trees", async () => {
        const tree1 = new Directory(
            new Map([
                ["dir1", new Directory()],
                [
                    "dir2",
                    new Directory(
                        new Map([
                            ["file2", new File()],
                            ["file3", new File()],
                        ]),
                    ),
                ],
                ["file1", new File()],
            ]),
        );
        const tree2 = new Directory(
            new Map([
                [
                    "dir2",
                    new Directory(
                        new Map([
                            ["file3", new File()],
                            ["file4", new File()],
                        ]),
                    ),
                ],
                ["dir3", new Directory(new Map([["file5", new File()]]))],
                ["file1", new File()],
                ["file6", new File()],
            ]),
        );

        expect(await mergeFsTrees(tree1, tree2)).toEqual(
            new Directory(
                new Map([
                    ["dir1", new Directory()],
                    [
                        "dir2",
                        new Directory(
                            new Map([
                                ["file2", new File()],
                                ["file3", new File()],
                                ["file4", new File()],
                            ]),
                        ),
                    ],
                    ["dir3", new Directory(new Map([["file5", new File()]]))],
                    ["file1", new File()],
                    ["file6", new File()],
                ]),
            ),
        );
    });

    test("generates correctly a fs tree", async () => {
        vol.fromNestedJSON({
            "/": {
                dir1: {
                    dir2: {
                        file2: "",
                        file3: "",
                    },
                },
                file1: "",
            },
        });

        expect(await treeFs("/")).toEqual(
            new Directory(
                new Map([
                    [
                        "dir1",
                        new Directory(
                            new Map([
                                [
                                    "dir2",
                                    new Directory(
                                        new Map([
                                            ["file2", new File()],
                                            ["file3", new File()],
                                        ]),
                                    ),
                                ],
                            ]),
                        ),
                    ],
                    ["file1", new File()],
                ]),
            ),
        );
    });

    test("path does not exist", async () => {
        expect(await treeFs("/does-not-exist")).toEqual(undefined);
    });

    test("undefined directory merge", async () => {
        expect(await mergeFsTrees(undefined, undefined)).toEqual(new Directory());
        expect(
            await mergeFsTrees(undefined, new Directory(new Map([["file", new File()]]))),
        ).toEqual(new Directory(new Map([["file", new File()]])));
        expect(
            await mergeFsTrees(new Directory(new Map([["file", new File()]])), undefined),
        ).toEqual(new Directory(new Map([["file", new File()]])));
    });
});

describe("Path Generator", () => {
    test("should generate paths correctly", () => {
        const assetsEntry = new Directory(
            new Map([
                [
                    "static",
                    new Directory(
                        new Map([
                            [
                                "images",
                                new Directory(
                                    new Map([
                                        ["logo.png", new File()],
                                        ["banner.png", new File()],
                                    ]),
                                ),
                            ],
                        ]),
                    ),
                ],
                [
                    "tags",
                    new Directory(
                        new Map([
                            ["google", new File()],
                            ["facebook", new File()],
                            ["amazon", new File()],
                            ["apple", new File()],
                            ["microsoft", new File()],
                        ]),
                    ),
                ],
                [
                    "home",
                    new Directory(
                        new Map([
                            [
                                "images",
                                new Directory(
                                    new Map([
                                        ["logo.png", new File()],
                                        ["banner.png", new File()],
                                    ]),
                                ),
                            ],
                            ["tag", new File()],
                        ]),
                    ),
                ],
                ["BUILDID", new File()],
            ]),
        );

        const routeEntry = new Directory(
            new Map([
                [
                    "tags",
                    new Directory(
                        new Map([["[tag]", new Directory(new Map([["page.tsx", new File()]]))]]),
                    ),
                ],
                [
                    "users",
                    new Directory(
                        new Map([["[id]", new Directory(new Map([["page.tsx", new File()]]))]]),
                    ),
                ],
                ["home", new Directory(new Map([["page.tsx", new File()]]))],
            ]),
        );

        expect(recursivePathGenerator(assetsEntry, routeEntry)).toEqual([
            "/static/*",
            "/tags/google",
            "/tags/facebook",
            "/tags/amazon",
            "/tags/apple",
            "/tags/microsoft",
            "/home/images/*",
            "/home/tag",
            "/BUILDID",
        ]);
    });

    test("route entry is empty, so no collisions can happen", () => {
        const assetsEntry = new Directory(
            new Map([
                [
                    "static",
                    new Directory(
                        new Map([
                            [
                                "images",
                                new Directory(
                                    new Map([
                                        ["logo.png", new File()],
                                        ["banner.png", new File()],
                                    ]),
                                ),
                            ],
                        ]),
                    ),
                ],
                [
                    "tags",
                    new Directory(
                        new Map([
                            ["google", new File()],
                            ["facebook", new File()],
                            ["amazon", new File()],
                            ["apple", new File()],
                            ["microsoft", new File()],
                        ]),
                    ),
                ],
                [
                    "home",
                    new Directory(
                        new Map([
                            [
                                "images",
                                new Directory(
                                    new Map([
                                        ["logo.png", new File()],
                                        ["banner.png", new File()],
                                    ]),
                                ),
                            ],
                            ["tag", new File()],
                        ]),
                    ),
                ],
                ["BUILDID", new File()],
            ]),
        );

        expect(recursivePathGenerator(assetsEntry, new Directory())).toEqual([
            "/static/*",
            "/tags/*",
            "/home/*",
            "/BUILDID",
        ]);
    });

    test("route entry has a wildcard", () => {
        const assetsEntry = new Directory(
            new Map([
                [
                    "static",
                    new Directory(
                        new Map([
                            ["dir1", new Directory()],
                            [
                                "dir2",
                                new Directory(
                                    new Map([
                                        ["a", new File()],
                                        ["b", new File()],
                                    ]),
                                ),
                            ],
                        ]),
                    ),
                ],
                [
                    "images",
                    new Directory(
                        new Map([
                            [
                                "dir2",
                                new Directory(
                                    new Map([
                                        ["a", new File()],
                                        ["b", new File()],
                                    ]),
                                ),
                            ],
                        ]),
                    ),
                ],
                ["BUILDID", new File()],
            ]),
        );

        const routeEntry = new Directory(
            new Map([
                [
                    "[username]",
                    new Directory(
                        new Map([
                            ["dir2", new Directory()],
                            ["dir3", new Directory()],
                        ]),
                    ),
                ],
                ["images", new Directory()],
            ]),
        );

        expect(recursivePathGenerator(assetsEntry, routeEntry)).toEqual([
            "/static/dir1/*",
            "/static/dir2/a",
            "/static/dir2/b",
            "/images/dir2/*",
            "/BUILDID",
        ]);
    });
});
