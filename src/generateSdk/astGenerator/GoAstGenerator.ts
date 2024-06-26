import path from "path";
import os from "os";
import fs from "fs";
import { log } from "../../utils/logging.js";
import {
    AstGeneratorInput,
    AstGeneratorInterface,
    AstGeneratorOutput,
    AstNodeType,
    ClassDefinition,
    MethodDefinition,
    MethodKindEnum,
    Node,
    SourceType,
    StructLiteral,
} from "../../models/genezioModels.js";
import { runNewProcess } from "../../utils/process.js";
import { checkIfGoIsInstalled } from "../../utils/go.js";
import { createTemporaryFolder } from "../../utils/file.js";
import { UserError } from "../../errors.js";
import { $, ExecaError } from "execa";

const releaseTag = "v0.1.2";
const binaryName = `golang_ast_generator_${releaseTag}`;

export class AstGenerator implements AstGeneratorInterface {
    async #compileGenezioGoAstExtractor() {
        const folder = await createTemporaryFolder();
        const astClone = await runNewProcess(
            "git clone --quiet https://github.com/Genez-io/go-ast.git .",
            folder,
        );
        if (!astClone) {
            throw new UserError(
                "Error: Failed to clone Go AST parser repository to " +
                    folder +
                    " temporary folder!",
            );
        }
        await runNewProcess(`git checkout --quiet tags/${releaseTag}`, folder);
        const goBuildSuccess = await runNewProcess(`go build -o ${binaryName} cmd/main.go`, folder);
        if (!goBuildSuccess) {
            throw new UserError(
                "Error: Failed to build Go AST parser in " + folder + " temporary folder!",
            );
        }

        if (!fs.existsSync(path.join(os.homedir(), ".genezio", ".golang_ast_generator"))) {
            fs.mkdirSync(path.join(os.homedir(), ".genezio", ".golang_ast_generator"));
        }

        const goAstGeneratorPath = path.join(folder, binaryName);
        const goAstGeneratorPathInHome = path.join(
            os.homedir(),
            ".genezio",
            ".golang_ast_generator",
            binaryName,
        );
        fs.copyFileSync(goAstGeneratorPath, goAstGeneratorPathInHome);
    }

    async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
        // Check if Go is installed
        checkIfGoIsInstalled();

        // Check if the go ast generator is compiled
        const goAstGeneratorPath = path.join(
            os.homedir(),
            ".genezio",
            ".golang_ast_generator",
            binaryName,
        );
        if (!fs.existsSync(goAstGeneratorPath)) {
            await this.#compileGenezioGoAstExtractor();
        }
        const classAbsolutePath = path.resolve(input.class.path);
        const result = await $({
            cwd: input.root,
        })`${goAstGeneratorPath} ${classAbsolutePath}`.catch((error: ExecaError) => {
            log.error(error.stderr);
            throw new UserError("Error: Failed to generate AST for class " + input.class.path);
        });

        const ast = JSON.parse(result.stdout);
        const error = ast.error;
        if (error) {
            if (ast.file && ast.line && ast.column) {
                log.error(new Error(`${error} at ${ast.file}:${ast.line}:${ast.column}`));
            } else {
                log.error(error);
            }
            throw new UserError("Error: Failed to generate AST for class " + input.class.path);
        }
        const goAstBody = ast.body;
        if (!goAstBody) {
            throw new UserError("Error: Failed to generate AST for class " + input.class.path);
        }

        const body: Node[] = [];

        for (const astNode of goAstBody) {
            if (astNode.type == AstNodeType.ClassDefinition) {
                const classDefinition: ClassDefinition = {
                    type: AstNodeType.ClassDefinition,
                    name: astNode.name,
                    path: astNode.path,
                    docString: astNode.docString,
                    methods: [],
                };
                for (const method of astNode.methods) {
                    const methodDefinition: MethodDefinition = {
                        type: AstNodeType.MethodDefinition,
                        name: method.name,
                        params: [],
                        kind: MethodKindEnum.method,
                        static: false,
                        docString: method.docString,
                        returnType: method.returnType,
                    };
                    for (const param of method.params) {
                        methodDefinition.params.push({
                            type: AstNodeType.ParameterDefinition,
                            name: param.name,
                            optional: param.optional,
                            rawType: param.rawType,
                            paramType: param.paramType,
                        });
                    }
                    classDefinition.methods.push(methodDefinition);
                }
                body.push(classDefinition);
            } else {
                switch (astNode.type) {
                    case AstNodeType.StructLiteral: {
                        const structLiteral: StructLiteral = {
                            type: AstNodeType.StructLiteral,
                            name: astNode.name,
                            path: astNode.path,
                            typeLiteral: astNode.typeLiteral,
                        };
                        body.push(structLiteral);
                        break;
                    }
                }
            }
        }

        return {
            program: {
                body,
                originalLanguage: "go",
                sourceType: SourceType.module,
            },
        };
    }
}

const supportedExtensions = ["go"];

export default { supportedExtensions, AstGenerator };
