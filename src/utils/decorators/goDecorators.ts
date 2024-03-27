import path from "path";
import FileDetails from "../../models/fileDetails.js";
import { ClassInfo } from "./decoratorTypes.js";
import fs from "fs";
import { createRequire } from "module";
import { default as Parser } from "tree-sitter";
import { DecoratorExtractor } from "./baseDecoratorExtractor.js";

export class GoDecoratorExtractor extends DecoratorExtractor {
    async getDecoratorsFromFile(file: string): Promise<ClassInfo[]> {
        const inputCode = fs.readFileSync(file, "utf8");
        const classes: ClassInfo[] = [];

        const require = createRequire(import.meta.url);
        const go = require("tree-sitter-go");
        const parser = new Parser();
        parser.setLanguage(go);

        const tree = parser.parse(inputCode);

        const root = tree.rootNode;
        root.namedChildren.forEach((child) => {
            switch (child.type) {
                case "type_declaration": {
                    const className = child.child(1)?.firstChild?.text || "";
                    const comment = child.previousSibling;
                    if (!comment) {
                        break;
                    }
                    const commentText = comment.text;
                    if (!commentText.includes("genezio: deploy")) {
                        break;
                    }
                    const classInfo = this.createGenezioClassInfo(className, file, commentText);
                    classes.push(classInfo);
                    break;
                }
                case "method_declaration": {
                    const class_identifier = child.child(1)?.child(1)?.child(1);
                    let className = "";
                    if (!class_identifier) {
                        break;
                    } else if (class_identifier.type === "type_identifier") {
                        className = class_identifier.text;
                    } else if (class_identifier.type === "pointer_type") {
                        className = class_identifier.child(1)?.text || "";
                    }
                    const methodName = child.child(2)?.text || "";
                    const comment = child.previousSibling;
                    if (comment?.type !== "comment") {
                        break;
                    }
                    const commentText = comment?.text || "";
                    if (!commentText.includes("genezio:")) {
                        break;
                    }
                    const classInfo = classes.find((c) => c.name === className);
                    if (classInfo) {
                        const methodInfo = this.createGenezioMethodInfo(methodName, commentText);
                        if (methodInfo) {
                            classInfo.methods.push(methodInfo);
                        }
                    }
                }
            }
        });

        return classes;
    }

    fileFilter(cwd: string): (file: FileDetails) => boolean {
        return (file: FileDetails) => {
            const folderPath = path.join(cwd, file.path);
            return (
                file.extension === ".go" &&
                !file.path.includes("node_modules") &&
                !file.path.includes(".git") &&
                !fs.lstatSync(folderPath).isDirectory()
            );
        };
    }
}
