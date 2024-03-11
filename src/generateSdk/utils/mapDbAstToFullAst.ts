import { UserError } from "../../errors.js";
import { AstSummaryClassResponse } from "../../models/astSummary.js";
import {
    AstNodeType,
    ClassDefinition,
    MethodDefinition,
    MethodKindEnum,
    Node,
    ParameterDefinition,
    Program,
    SourceType,
} from "../../models/genezioModels.js";

export function mapDbAstToSdkGeneratorAst(ast: AstSummaryClassResponse): Program {
    if (ast.version !== "2") {
        throw new UserError(
            "Cannot generate SDK due to unsupported version. Please update your genezio CLI tool, redeploy your project, and try again.",
        );
    }
    const program: Program = {
        originalLanguage: "",
        sourceType: SourceType.module,
        body: [...(ast.types as Node[])],
    };

    const classDefinition: ClassDefinition = {
        type: AstNodeType.ClassDefinition,
        name: ast.name,
        path: ast.path,
        docString: ast.docString,
        methods: ast.methods.map(
            (method): MethodDefinition => ({
                type: AstNodeType.MethodDefinition,
                name: method.name,
                docString: method.docString,
                params: method.params.map(
                    (param): ParameterDefinition => ({
                        type: AstNodeType.ParameterDefinition,
                        name: param.name,
                        rawType: "",
                        paramType: param.type,
                        optional: param.optional,
                        defaultValue: undefined,
                    }),
                ),
                kind: MethodKindEnum.method,
                static: false,
                returnType: method.returnType,
            }),
        ),
    };

    program.body?.push(classDefinition);

    return program;
}
