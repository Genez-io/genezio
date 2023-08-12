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
} from "../../models/genezioModels.js";

import typescript from "typescript";
import { readdirSync } from "fs";
import path from "path";
import { statSync } from "fs";

export class AstGenerator implements AstGeneratorInterface {
  rootNode?: typescript.SourceFile;

  mapTypesToParamType(type: typescript.Node, typeChecker: typescript.TypeChecker, declarations: Node[]): DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | ArrayType | DateType | CustomAstNodeType | TypeLiteral | UnionType | PromiseType | VoidType | EnumType {
    switch ((type as any).kind) {
      case typescript.SyntaxKind.StringKeyword:
        return { type: AstNodeType.StringLiteral };
      case typescript.SyntaxKind.NumberKeyword:
        return { type: AstNodeType.DoubleLiteral };
      case typescript.SyntaxKind.BooleanKeyword:
        return { type: AstNodeType.BooleanLiteral };
      //case arrays
      case typescript.SyntaxKind.ArrayType:
        return { type: AstNodeType.ArrayType, generic: this.mapTypesToParamType((type as any).elementType, typeChecker, declarations) };
      case typescript.SyntaxKind.AnyKeyword:
        return { type: AstNodeType.AnyLiteral };
      case typescript.SyntaxKind.VoidKeyword:
        return { type: AstNodeType.VoidLiteral };
      case typescript.SyntaxKind.TypeReference: {
        const escapedText: string = (type as any).typeName.escapedText;

        if (escapedText === "Promise") {
          return { type: AstNodeType.PromiseType, generic: this.mapTypesToParamType((type as any).typeArguments[0], typeChecker, declarations) };
        } else if (escapedText === "Array") {
          return { type: AstNodeType.ArrayType, generic: this.mapTypesToParamType((type as any).typeArguments[0], typeChecker, declarations) };
        } else if (escapedText === "Date") {
          return { type: AstNodeType.DateType };
        }
        const typeAtLocation = typeChecker.getTypeAtLocation((type as any).typeName);
        const typeAtLocationPath = (typeAtLocation.aliasSymbol as any).declarations?.[0].getSourceFile().symbol.escapedName;
        const trimmedPath = typeAtLocationPath.substring(1, typeAtLocationPath.length - 1);
        const pathFile = path.relative(process.cwd(), trimmedPath);
        if (!this.isDeclarationInList(escapedText, pathFile, declarations)) {
          let declaredNode: StructLiteral | TypeAlias | Enum;
          if (typeAtLocation.aliasSymbol?.declarations?.[0].kind === typescript.SyntaxKind.TypeAliasDeclaration) {
            declaredNode = this.parseTypeAliasDeclaration((typeAtLocation.aliasSymbol?.declarations?.[0] as any), typeChecker, declarations);
          } else if (typeAtLocation.aliasSymbol?.declarations?.[0].kind === typescript.SyntaxKind.EnumDeclaration) {
            declaredNode = this.parseEnumDeclaration(typeAtLocation.aliasSymbol?.declarations?.[0] as any);
          } else {
            return { type: AstNodeType.CustomNodeLiteral, rawValue: (type as any).typeName.escapedText };
          }
          declaredNode.name = escapedText;
          declaredNode.path = pathFile;
          declarations.push(declaredNode);
        }
        return { type: AstNodeType.CustomNodeLiteral, rawValue: (type as any).typeName.escapedText };
      }
      case typescript.SyntaxKind.TypeLiteral: {
        const properties: PropertyDefinition[] = [];
        for (const member of (type as any).members) {
          if (member.type) {
            const property: PropertyDefinition = {
              name: member.name.escapedText,
              optional: member.questionToken ? true : false,
              type: this.mapTypesToParamType(member.type, typeChecker, declarations)
            };
            properties.push(property);
          }
        }
        return { type: AstNodeType.TypeLiteral, properties: properties };
      }
      case typescript.SyntaxKind.UnionType: {
        const params: Node[] = [];
        for (const typeNode of (type as any).types) {
          params.push(this.mapTypesToParamType(typeNode, typeChecker, declarations));
        }
        return { type: AstNodeType.UnionType, params: params };
      }
      default:
        return { type: AstNodeType.AnyLiteral };
    }
  }

  isDeclarationInList(name: string, path: string, declarations: Node[]): boolean {
    for (const declarationInList of declarations) {
      if ((declarationInList as any).name === name && declarationInList.path === path) {
        return true;
      }
    }
    return false;
  }

  parseClassDeclaration(classDeclaration: typescript.Node, typeChecker: typescript.TypeChecker, declarations: Node[]): ClassDefinition | undefined {
    const copy: any = { ...classDeclaration };
    if (copy.modifiers) {
      for (const modifier of copy.modifiers) {
        if (modifier.kind === typescript.SyntaxKind.ExportKeyword) {
          const methods: MethodDefinition[] = [];
          for (const member of copy.members) {
            if (typescript.isMethodDeclaration(member)) {
              const memberCopy: any = { ...member };
              const method = this.parseMethodSignature(memberCopy, typeChecker, declarations);
              if (method) {
                methods.push(method);
              }
            }
          }
          return {
            type: AstNodeType.ClassDefinition,
            name: copy.name.escapedText,
            methods: methods
          }
        }
      }
    }
    return undefined;
  }

  parseTypeAliasDeclaration(typeAliasDeclaration: typescript.Node, typeChecker: typescript.TypeChecker, declarations: Node[]): StructLiteral | TypeAlias {
    const typeAliasDeclarationCopy: any = { ...typeAliasDeclaration };
    if (typeAliasDeclarationCopy.type.kind === typescript.SyntaxKind.TypeLiteral) {
      const structLiteral: StructLiteral = {
        type: AstNodeType.StructLiteral,
        name: '',
        typeLiteral: {
          type: AstNodeType.TypeLiteral,
          properties: [],
        }
      }
      for (const member of typeAliasDeclarationCopy.type.members) {
        if (member.type) {
          const field: PropertyDefinition = {
            name: member.name.escapedText,
            optional: member.questionToken ? true : false,
            type: this.mapTypesToParamType(member.type, typeChecker, declarations),
          }
          structLiteral.typeLiteral.properties.push(field);
        }
      }
      return structLiteral;
    } else {
      return {
        type: AstNodeType.TypeAlias,
        name: '',
        aliasType: this.mapTypesToParamType(typeAliasDeclarationCopy.type, typeChecker, declarations)
      }
    }
  }

  parseMethodSignature(methodSignature: typescript.Node, typeChecker: typescript.TypeChecker, declarations: Node[]): MethodDefinition | undefined {
    const parameters: ParameterDefinition[] = [];
    const methodSignatureCopy: any = { ...methodSignature };
    if (methodSignatureCopy.name.kind === typescript.SyntaxKind.PrivateIdentifier) {
      return undefined;
    }
    if (methodSignatureCopy.parameters) {
      for (const parameter of methodSignatureCopy.parameters) {
        if (parameter.type) {
          const param: ParameterDefinition = {
            type: AstNodeType.ParameterDefinition,
            name: parameter.name.escapedText,
            rawType: "",
            paramType: this.mapTypesToParamType(parameter.type, typeChecker, declarations),
            optional: parameter.questionToken ? true : false,
            defaultValue: parameter.initializer ? { value: parameter.initializer.text, type: parameter.initializer.kind === 10 ? AstNodeType.StringLiteral : AstNodeType.DoubleLiteral } : undefined
          }
          parameters.push(param);
        }
      }
    }
    return {
      type: AstNodeType.MethodDefinition,
      name: methodSignatureCopy.name.escapedText,
      params: parameters,
      returnType: methodSignatureCopy.type ? this.mapTypesToParamType(methodSignatureCopy.type, typeChecker, declarations) : { type: AstNodeType.VoidLiteral },
      static: false,
      kind: MethodKindEnum.method
    }
  }

  parseEnumDeclaration(enumDeclaration: typescript.Node): Enum {
    const enumDeclarationCopy: any = { ...enumDeclaration };
    return {
      type: AstNodeType.Enum,
      name: enumDeclarationCopy.name.escapedText,
      cases: enumDeclarationCopy.members.map((member: any, index: number) => {
        if (!member.initializer) {
          return { name: member.name.escapedText, value: index, type: AstNodeType.DoubleLiteral }
        }

        switch (member.initializer.kind) {
          case typescript.SyntaxKind.NumericLiteral:
            return { name: member.name.escapedText, value: member.initializer.text, type: AstNodeType.DoubleLiteral }
          case typescript.SyntaxKind.StringLiteral:
            return { name: member.name.escapedText, value: member.initializer.text, type: AstNodeType.StringLiteral }
          default:
            throw new Error("Unsupported enum value type")
        }
      })
    }
  }

  getAllFiles(files: string[], dirPath: string) {
    if (dirPath.endsWith("node_modules")) {
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
    const typescriptFiles: string[] = [];
    this.getAllFiles(typescriptFiles, ".");

    const program = typescript.createProgram(typescriptFiles, {});
    const typeChecker = program.getTypeChecker();

    const files = program.getSourceFiles();
    files.forEach((file) => {
      if (path.resolve(file.fileName) === path.resolve(input.class.path)) {
        this.rootNode = file;
      }
    });

    if (!this.rootNode) {
      throw new Error("No root node found");
    }
    let classDefinition: ClassDefinition | undefined = undefined;
    const declarations: Node[] = [];
    this.rootNode.forEachChild((child) => {
      if (typescript.isEnumDeclaration(child)) {
        const enumDeclaration = this.parseEnumDeclaration(child);
        declarations.push(enumDeclaration);
      } else if (typescript.isClassDeclaration(child)) {
        const classDeclaration = this.parseClassDeclaration(child, typeChecker, declarations);
        if (classDeclaration && !classDefinition) {
          classDefinition = classDeclaration;
        }
      }
    });

    if (!classDefinition) {
      throw new Error("No exported class found in file.");
    }

    return {
      program: {
        originalLanguage: "typescript",
        sourceType: SourceType.module,
        body: [classDefinition, ...declarations],
      }
    }
  }
}

const supportedExtensions = ["ts"]

export default { supportedExtensions, AstGenerator }
