import {
    AstGeneratorInterface,
    AstGeneratorInput,
    SourceType,
    AstGeneratorOutput,
    AnyType,
    AstNodeType,
    DoubleType,
    IntegerType,
    StringType,
    BooleanType,
    FloatType,
    ArrayType,
    ClassDefinition,
    MethodKindEnum,
    MethodDefinition,
    CustomAstNodeType,
    ParameterDefinition,
    Enum,
    Node,
    StructLiteral,
    TypeAlias,
    PropertyDefinition,
    TypeLiteral,
    UnionType,
    PromiseType,
    VoidType,
    EnumType,
    DateType,
    MapType,
    BigIntType,
} from "../../models/genezioModels.js";

import typescript from "typescript";
import { readdirSync } from "fs";
import path from "path";
import { statSync } from "fs";
import { GENEZIO_CLASS_STATIC_METHOD_NOT_SUPPORTED, UserError } from "../../errors.js";

type Declaration = StructLiteral | TypeAlias | Enum;

// This properties should be populated only once and then reused
let _files: readonly typescript.SourceFile[] | undefined;
let _typeChecker: typescript.TypeChecker | undefined;

export class AstGenerator implements AstGeneratorInterface {
    rootNode?: typescript.SourceFile;

    get files(): readonly typescript.SourceFile[] {
        // Lazy initialization: execute logic only once
        if (!_files) {
            const typescriptFiles: string[] = [];
            this.getAllFiles(typescriptFiles, ".");

            const program = typescript.createProgram(typescriptFiles, {});
            _typeChecker = program.getTypeChecker();
            _files = program.getSourceFiles();
        }
        return _files;
    }

    get typeChecker(): typescript.TypeChecker {
        // Lazy initialization: execute logic only once
        if (!_typeChecker) {
            const typescriptFiles: string[] = [];
            this.getAllFiles(typescriptFiles, ".");

            const program = typescript.createProgram(typescriptFiles, {});
            _typeChecker = program.getTypeChecker();
            _files = program.getSourceFiles();
        }
        return _typeChecker;
    }

    mapTypesToParamType(
        type: typescript.Node,
        typeChecker: typescript.TypeChecker,
        declarations: Declaration[],
    ):
        | DoubleType
        | IntegerType
        | StringType
        | BigIntType
        | BooleanType
        | FloatType
        | AnyType
        | ArrayType
        | DateType
        | CustomAstNodeType
        | TypeLiteral
        | UnionType
        | PromiseType
        | VoidType
        | EnumType
        | MapType {
        switch (type.kind) {
            case typescript.SyntaxKind.LiteralType: {
                const literalType = type as typescript.LiteralTypeNode;

                return {
                    type: AstNodeType.CustomNodeLiteral,
                    rawValue: literalType.literal.getText(),
                };
            }
            case typescript.SyntaxKind.BigIntKeyword:
                return { type: AstNodeType.BigIntLiteral };
            case typescript.SyntaxKind.StringKeyword:
                return { type: AstNodeType.StringLiteral };
            case typescript.SyntaxKind.NumberKeyword:
                return { type: AstNodeType.DoubleLiteral };
            case typescript.SyntaxKind.BooleanKeyword:
                return { type: AstNodeType.BooleanLiteral };
            //case arrays
            case typescript.SyntaxKind.ArrayType:
                return {
                    type: AstNodeType.ArrayType,
                    generic: this.mapTypesToParamType(
                        (type as typescript.ArrayTypeNode).elementType,
                        typeChecker,
                        declarations,
                    ),
                };
            case typescript.SyntaxKind.AnyKeyword:
                return { type: AstNodeType.AnyLiteral };
            case typescript.SyntaxKind.VoidKeyword:
                return { type: AstNodeType.VoidLiteral };
            case typescript.SyntaxKind.TypeReference: {
                const escapedText: string = (
                    type as typescript.TypeReferenceNode
                ).typeName.getText();
                const typeArguments = (type as typescript.TypeReferenceNode).typeArguments;

                if (escapedText === "Promise") {
                    if (!typeArguments || typeArguments.length === 0) {
                        return { type: AstNodeType.AnyLiteral };
                    }

                    return {
                        type: AstNodeType.PromiseType,
                        generic: this.mapTypesToParamType(
                            typeArguments[0],
                            typeChecker,
                            declarations,
                        ),
                    };
                } else if (escapedText === "Array") {
                    if (!typeArguments || typeArguments.length === 0) {
                        return { type: AstNodeType.AnyLiteral };
                    }

                    return {
                        type: AstNodeType.ArrayType,
                        generic: this.mapTypesToParamType(
                            typeArguments[0],
                            typeChecker,
                            declarations,
                        ),
                    };
                } else if (escapedText === "Date") {
                    return { type: AstNodeType.DateType };
                }
                const typeAtLocation = typeChecker.getTypeAtLocation(
                    (type as typescript.TypeReferenceNode).typeName,
                );
                let typeAtLocationPath =
                    typeAtLocation.aliasSymbol?.declarations?.[0].getSourceFile().fileName;
                if (typeAtLocationPath?.endsWith(".ts")) {
                    typeAtLocationPath = typeAtLocationPath.slice(0, -3);
                    if (typeAtLocationPath.endsWith(".d")) {
                        typeAtLocationPath = typeAtLocationPath.slice(0, -2);
                    }
                    // We do this because typescript ignores the node_modules folder
                    // And the types that are present in the node_modules will dissapear
                    if (typeAtLocationPath.includes("node_modules")) {
                        typeAtLocationPath = typeAtLocationPath.replace("node_modules", "src");
                    }
                }
                if (!typeAtLocationPath) {
                    throw new UserError(
                        `Type ${escapedText} is not supported by genezio. Take a look at the documentation to see the supported types. https://docs.genezio.com/`,
                    );
                }
                const pathFile = path
                    .relative(process.cwd(), typeAtLocationPath)
                    .replace(/\\/g, "/");

                if (!this.isDeclarationInList(escapedText, pathFile, declarations)) {
                    let declaredNode: StructLiteral | TypeAlias | Enum;
                    if (
                        typeAtLocation.aliasSymbol?.declarations?.[0] &&
                        typescript.isTypeAliasDeclaration(
                            typeAtLocation.aliasSymbol?.declarations?.[0],
                        )
                    ) {
                        declaredNode = this.parseTypeAliasDeclaration(
                            typeAtLocation.aliasSymbol?.declarations?.[0],
                            typeChecker,
                            declarations,
                        );
                    } else if (
                        typeAtLocation.aliasSymbol?.declarations?.[0] &&
                        typescript.isEnumDeclaration(typeAtLocation.aliasSymbol?.declarations?.[0])
                    ) {
                        declaredNode = this.parseEnumDeclaration(
                            typeAtLocation.aliasSymbol?.declarations?.[0],
                        );
                    } else {
                        return {
                            type: AstNodeType.CustomNodeLiteral,
                            rawValue: (type as typescript.TypeReferenceNode).typeName.getText(),
                        };
                    }
                    declaredNode.name = escapedText;
                    declaredNode.path = pathFile;
                    declarations.push(declaredNode);
                }
                return {
                    type: AstNodeType.CustomNodeLiteral,
                    rawValue: (type as typescript.TypeReferenceNode).typeName.getText(),
                };
            }
            case typescript.SyntaxKind.TypeLiteral: {
                const properties: PropertyDefinition[] = [];

                for (const member of (type as typescript.TypeLiteralNode).members) {
                    if (typescript.isPropertySignature(member) && member.type) {
                        properties.push({
                            name: typescript.isIdentifier(member.name)
                                ? member.name.text
                                : "undefined",
                            optional: member.questionToken ? true : false,
                            type: this.mapTypesToParamType(member.type, typeChecker, declarations),
                        });
                    }

                    if (typescript.isIndexSignatureDeclaration(member)) {
                        properties.push({
                            name:
                                member.name && typescript.isIdentifier(member.name)
                                    ? member.name.text
                                    : "undefined",
                            optional: member.questionToken ? true : false,
                            type: this.mapTypesToParamType(member, typeChecker, declarations),
                        });
                    }
                }
                return {
                    type: AstNodeType.TypeLiteral,
                    properties: properties,
                };
            }
            case typescript.SyntaxKind.UnionType: {
                const params: Node[] = [];
                for (const typeNode of (type as typescript.UnionTypeNode).types) {
                    params.push(this.mapTypesToParamType(typeNode, typeChecker, declarations));
                }
                return { type: AstNodeType.UnionType, params: params };
            }
            case typescript.SyntaxKind.IndexSignature: {
                return {
                    type: AstNodeType.MapType,
                    genericKey: this.mapTypesToParamType(
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        // In this case the type is always defined, because an IndexSignature is
                        // guaranteed to have only one parameter with a type of either string,
                        // number or symbol.
                        (type as typescript.IndexSignatureDeclaration).parameters[0].type!,
                        typeChecker,
                        declarations,
                    ),
                    genericValue: this.mapTypesToParamType(
                        (type as typescript.IndexSignatureDeclaration).type,
                        typeChecker,
                        declarations,
                    ),
                };
            }
            default:
                return { type: AstNodeType.AnyLiteral };
        }
    }

    isDeclarationInList(name: string, path: string, declarations: Declaration[]): boolean {
        for (const declarationInList of declarations) {
            if (declarationInList.name === name && declarationInList.path === path) {
                return true;
            }
        }
        return false;
    }

    parseClassDeclaration(
        classDeclaration: typescript.ClassDeclaration,
        typeChecker: typescript.TypeChecker,
        declarations: Declaration[],
    ): ClassDefinition | undefined {
        const copy = { ...classDeclaration };
        if (copy.modifiers) {
            for (const modifier of copy.modifiers) {
                if (modifier.kind === typescript.SyntaxKind.ExportKeyword) {
                    const methods: MethodDefinition[] = [];
                    for (const member of copy.members) {
                        if (typescript.isMethodDeclaration(member)) {
                            const method = this.parseMethodDeclaration(
                                member,
                                typeChecker,
                                declarations,
                            );
                            if (method) {
                                methods.push(method);
                            }
                        }
                    }
                    if (classDeclaration.name === undefined) {
                        throw new UserError("Class name is undefined");
                    }
                    const typeAtLocation = typeChecker.getTypeAtLocation(classDeclaration.name);
                    let typeAtLocationPath =
                        typeAtLocation.symbol.declarations?.[0].getSourceFile().fileName;
                    if (typeAtLocationPath?.endsWith(".ts")) {
                        typeAtLocationPath = typeAtLocationPath.slice(0, -3);
                    }
                    if (!typeAtLocationPath) {
                        throw new UserError("Could not find class declaration file path");
                    }
                    const pathFile = path
                        .relative(process.cwd(), typeAtLocationPath)
                        .replace(/\\/g, "/");

                    let docString: string | undefined = undefined;
                    const sourceFile = this.rootNode;
                    if (sourceFile !== undefined) {
                        const commentRanges = typescript.getLeadingCommentRanges(
                            sourceFile.getFullText(),
                            copy.pos,
                        );

                        // Iterate over all the comments and retain only the last JSDoc comment
                        for (const comment of commentRanges ?? []) {
                            const commentText = extractDocStringFromJsDoc(
                                sourceFile.getFullText().slice(comment.pos, comment.end),
                            );

                            docString = commentText || docString;
                        }
                    }

                    return {
                        type: AstNodeType.ClassDefinition,
                        name: copy.name?.text ?? "undefined",
                        methods: methods,
                        path: pathFile,
                        docString: docString,
                    };
                }
            }
        }
        return undefined;
    }

    parseTypeAliasDeclaration(
        typeAliasDeclaration: typescript.TypeAliasDeclaration,
        typeChecker: typescript.TypeChecker,
        declarations: Declaration[],
    ): StructLiteral | TypeAlias {
        const typeAliasDeclarationCopy = { ...typeAliasDeclaration };
        if (typescript.isTypeLiteralNode(typeAliasDeclarationCopy.type)) {
            const structLiteral: StructLiteral = {
                type: AstNodeType.StructLiteral,
                name: "",
                typeLiteral: {
                    type: AstNodeType.TypeLiteral,
                    properties: [],
                },
            };

            for (const member of typeAliasDeclarationCopy.type.members) {
                if (
                    (typescript.isPropertySignature(member) ||
                        typescript.isIndexSignatureDeclaration(member)) &&
                    member.type
                ) {
                    if (member.name && typescript.isComputedPropertyName(member.name)) {
                        throw new UserError("Computed property names are not supported");
                    }

                    const field: PropertyDefinition = {
                        name: member.name?.text ?? "undefined",
                        optional: member.questionToken ? true : false,
                        type:
                            member.kind === typescript.SyntaxKind.IndexSignature
                                ? this.mapTypesToParamType(member, typeChecker, declarations)
                                : this.mapTypesToParamType(member.type, typeChecker, declarations),
                    };
                    structLiteral.typeLiteral.properties.push(field);
                }
            }
            return structLiteral;
        } else {
            return {
                type: AstNodeType.TypeAlias,
                name: "",
                aliasType: this.mapTypesToParamType(
                    typeAliasDeclarationCopy.type,
                    typeChecker,
                    declarations,
                ),
            };
        }
    }

    parseMethodDeclaration(
        methodDeclaration: typescript.MethodDeclaration,
        typeChecker: typescript.TypeChecker,
        declarations: Declaration[],
    ): MethodDefinition | undefined {
        const parameters: ParameterDefinition[] = [];
        const methodDeclarationCopy = { ...methodDeclaration };
        if (
            methodDeclarationCopy.name.kind === typescript.SyntaxKind.PrivateIdentifier ||
            methodDeclarationCopy.modifiers?.[0].kind === typescript.SyntaxKind.PrivateKeyword
        ) {
            return undefined;
        }

        if (
            methodDeclarationCopy.modifiers?.some(
                (modifier) => modifier.kind === typescript.SyntaxKind.StaticKeyword,
            )
        ) {
            throw new UserError(GENEZIO_CLASS_STATIC_METHOD_NOT_SUPPORTED);
        }

        for (const parameter of methodDeclarationCopy.parameters) {
            if (parameter.type) {
                const param: ParameterDefinition = {
                    type: AstNodeType.ParameterDefinition,
                    name: typescript.isIdentifier(parameter.name)
                        ? parameter.name.text
                        : "undefined",
                    rawType: "",
                    paramType: this.mapTypesToParamType(parameter.type, typeChecker, declarations),
                    optional: parameter.questionToken ? true : false,
                    defaultValue: parameter.initializer
                        ? {
                              value: parameter.initializer.getText(),
                              type:
                                  parameter.initializer.kind === typescript.SyntaxKind.StringLiteral
                                      ? AstNodeType.StringLiteral
                                      : AstNodeType.AnyLiteral,
                          }
                        : undefined,
                };
                parameters.push(param);
            }
        }

        let methodName: string = "";
        switch (methodDeclarationCopy.name.kind) {
            case typescript.SyntaxKind.Identifier:
            case typescript.SyntaxKind.StringLiteral:
            case typescript.SyntaxKind.NumericLiteral:
                methodName = methodDeclarationCopy.name.text;
                break;
            case typescript.SyntaxKind.ComputedPropertyName:
                throw new UserError("Computed property names as method names are not supported");
        }

        let docString: string | undefined = undefined;
        const sourceFile = this.rootNode;
        if (sourceFile !== undefined) {
            const commentRanges = typescript.getLeadingCommentRanges(
                sourceFile.getFullText(),
                methodDeclarationCopy.pos,
            );

            // Iterate over all the comments and retain only the last JSDoc comment
            for (const comment of commentRanges ?? []) {
                const commentText = extractDocStringFromJsDoc(
                    sourceFile.getFullText().slice(comment.pos, comment.end),
                );

                docString = commentText || docString;
            }
        }

        return {
            type: AstNodeType.MethodDefinition,
            docString: docString,
            name: methodName,
            params: parameters,
            returnType: methodDeclarationCopy.type
                ? this.mapTypesToParamType(methodDeclarationCopy.type, typeChecker, declarations)
                : { type: AstNodeType.AnyLiteral },
            static: false,
            kind: MethodKindEnum.method,
        };
    }

    parseEnumDeclaration(enumDeclaration: typescript.EnumDeclaration): Enum {
        const enumDeclarationCopy = { ...enumDeclaration };
        return {
            type: AstNodeType.Enum,
            name: enumDeclarationCopy.name.text,
            cases: enumDeclarationCopy.members.map((member, index: number) => {
                if (typescript.isComputedPropertyName(member.name)) {
                    throw new UserError("Computed property names as enum cases are not supported");
                }

                if (!member.initializer) {
                    return {
                        name: member.name.text,
                        value: index,
                        type: AstNodeType.DoubleLiteral,
                    };
                }

                switch (member.initializer.kind) {
                    case typescript.SyntaxKind.NumericLiteral:
                        return {
                            name: member.name.text,
                            value: (member.initializer as typescript.NumericLiteral).text,
                            type: AstNodeType.DoubleLiteral,
                        };
                    case typescript.SyntaxKind.StringLiteral:
                        return {
                            name: member.name.text,
                            value: (member.initializer as typescript.StringLiteral).text,
                            type: AstNodeType.StringLiteral,
                        };
                    default:
                        throw new UserError("Unsupported enum value type");
                }
            }),
        };
    }

    getAllFiles(files: string[], dirPath: string) {
        const ignoreFolders = [
            "node_modules",
            ".git",
            ".svn",
            ".vscode",
            ".idea",
            ".cache",
            "tmp",
            ".temp",
            ".history",
            ".nyc_output",
            ".terraform",
            ".serverless",
        ];

        // Check if the current directory is in the ignore list
        if (ignoreFolders.some((folder) => dirPath.indexOf(folder) !== -1)) {
            return;
        }

        readdirSync(dirPath).forEach((file) => {
            const absolute = path.join(dirPath, file);
            if (statSync(absolute).isDirectory()) {
                this.getAllFiles(files, absolute);
            } else if (file.endsWith(".ts")) {
                files.push(absolute);
            }
        });
    }

    async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
        this.files.forEach((file) => {
            if (path.resolve(file.fileName) === path.resolve(input.class.path)) {
                this.rootNode = file;
            }
        });

        if (!this.rootNode) {
            throw new UserError("No root node found");
        }
        let classDefinition: ClassDefinition | undefined = undefined;
        const declarations: Declaration[] = [];
        this.rootNode.forEachChild((child) => {
            if (typescript.isClassDeclaration(child)) {
                const classDeclaration = this.parseClassDeclaration(
                    child,
                    this.typeChecker,
                    declarations,
                );
                if (classDeclaration && !classDefinition) {
                    classDefinition = classDeclaration;
                }
            }
        });

        if (!classDefinition) {
            throw new UserError("No exported class found in file.");
        }

        return {
            program: {
                originalLanguage: "typescript",
                sourceType: SourceType.module,
                body: [classDefinition, ...declarations],
            },
        };
    }
}

function extractDocStringFromJsDoc(jsDoc: string): string | undefined {
    // Only match comments that start with `/**` and end with `*/` (i.e. JSDoc comments)
    const jsDocRegex = /\/\*\*([\s\S]*?)\*\//;
    const match = jsDoc.match(jsDocRegex);
    if (match) {
        // Remove the leading ` * ` from each line
        return match[1]
            .replace(/(^|\n)\s*\*\s*/g, "$1")
            .split("\n")
            .map((l) => l.trim())
            .join("\n");
    }

    return undefined;
}

const supportedExtensions = ["ts"];

export default { supportedExtensions, AstGenerator };
