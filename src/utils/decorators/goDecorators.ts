import path from "path";
import FileDetails from "../../models/fileDetails.js";
import { ClassInfo } from "./decoratorTypes.js";
import fs from "fs";
import { DecoratorExtractor } from "./baseDecoratorExtractor.js";
import { createTemporaryFolder } from "../file.js";
import { runNewProcess } from "../process.js";
import { UserError } from "../../errors.js";
import os from "os";
import { checkIfGoIsInstalled } from "../go.js";
import { $, ExecaError } from "execa";
import { log } from "../logging.js";

const releaseTag = "v0.1.0";
const binaryName = `genezio_go_parser_${releaseTag}`;

type Class = {
    name: string;
    comment: string;
};

type Method = {
    name: string;
    comment: string;
    className: string;
};

type Response = {
    classes: Class[];
    methods: Method[];
};

export class GoDecoratorExtractor extends DecoratorExtractor {
    async #compileGenezioGoParser() {
        const folder = await createTemporaryFolder();
        const parserClone = await runNewProcess(
            "git clone --quiet https://github.com/Genez-io/go-parser.git .",
            folder,
        );
        if (!parserClone) {
            throw new UserError(
                "Error: Failed to clone Go parser repository to " + folder + " temporary folder!",
            );
        }
        await runNewProcess(`git checkout --quiet tags/${releaseTag}`, folder);
        const goBuildSuccess = await runNewProcess(`go build -o ${binaryName} cmd/main.go`, folder);
        if (!goBuildSuccess) {
            throw new UserError(
                "Error: Failed to build Go parser in " + folder + " temporary folder!",
            );
        }

        if (!fs.existsSync(path.join(os.homedir(), ".genezio", ".genezio_go_parser"))) {
            fs.mkdirSync(path.join(os.homedir(), ".genezio", ".genezio_go_parser"));
        }
        const goParserPath = path.join(folder, binaryName);
        const goParserPathInHome = path.join(
            os.homedir(),
            ".genezio",
            ".genezio_go_parser",
            binaryName,
        );
        fs.copyFileSync(goParserPath, goParserPathInHome);
    }

    async getDecoratorsFromFile(file: string, cwd: string): Promise<ClassInfo[]> {
        checkIfGoIsInstalled();

        const goParserPath = path.join(os.homedir(), ".genezio", ".genezio_go_parser", binaryName);

        if (!fs.existsSync(goParserPath)) {
            await this.#compileGenezioGoParser();
        }

        const classAbsolutePath = path.resolve(file);
        const result = await $({
            cwd: cwd,
        })`${goParserPath} ${classAbsolutePath}`.catch((error: ExecaError) => {
            log.error(error);
            throw new UserError("Error: Failed to parse Go file for class" + file);
        });
        const classes: ClassInfo[] = [];
        const response: Response = JSON.parse(result.stdout);
        if (response.classes) {
            for (const c of response.classes) {
                const classInfo = DecoratorExtractor.createGenezioClassInfo(
                    c.name,
                    file,
                    c.comment,
                );
                classes.push(classInfo);
            }
        }
        if (response.methods) {
            for (const m of response.methods) {
                const classInfo = classes.find((c) => c.name === m.className);
                if (classInfo) {
                    const methodInfo = DecoratorExtractor.createGenezioMethodInfo(
                        m.name,
                        m.comment,
                    );
                    if (methodInfo) {
                        classInfo.methods.push(methodInfo);
                    }
                }
            }
        }

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
