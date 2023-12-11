import { describe, expect, test } from "@jest/globals";
import path from "path";

import { ensureRelativePaths } from "../src/utils/file";

describe("genezioignore paths", () => {
    test("relative dir starting with dot", () => {
        expect(ensureRelativePaths("./test")).toEqual("test");
    });

    test("relative dir starting without dot", () => {
        expect(ensureRelativePaths("test")).toEqual("test");
    });

    test("relative dir ending with " + path.sep, () => {
        expect(ensureRelativePaths("test" + path.sep)).toEqual(`test${path.sep}**`);
    });

    test("relative file starting with dot", () => {
        expect(ensureRelativePaths("./test/1.txt")).toEqual(`test${path.sep}1.txt`);
    });

    test("relative file starting without dot", () => {
        expect(ensureRelativePaths("test/1.txt")).toEqual(`test${path.sep}1.txt`);
    });

    test("negated file starting with dot", () => {
        expect(ensureRelativePaths("!./test/1.txt")).toEqual(`!test${path.sep}1.txt`);
    });

    test("negated file starting without dot", () => {
        expect(ensureRelativePaths("!test/1.txt")).toEqual(`!test${path.sep}1.txt`);
    });
});
