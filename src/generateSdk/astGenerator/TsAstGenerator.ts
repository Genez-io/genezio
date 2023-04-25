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
  PromiseType
} from "../../models/genezioModels";

import typescript from "typescript";

export class AstGenerator implements AstGeneratorInterface {
  mapTypesToParamType(type: typescript.Node): DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | ArrayType | CustomAstNodeType | TypeLiteral | UnionType | PromiseType {
    switch (type.kind) {
      case typescript.SyntaxKind.StringKeyword:
        return { type: AstNodeType.StringLiteral };
      case typescript.SyntaxKind.NumberKeyword:
        return { type: AstNodeType.DoubleLiteral };
      case typescript.SyntaxKind.BooleanKeyword:
        return { type: AstNodeType.BooleanLiteral };
      //case arrays
      case typescript.SyntaxKind.ArrayType:
        return { type: AstNodeType.ArrayType, generic: this.mapTypesToParamType((type as any).elementType) };
      case typescript.SyntaxKind.AnyKeyword:
        return { type: AstNodeType.AnyLiteral };
      case typescript.SyntaxKind.TypeReference: {
        const escapedText: string = (type as any).typeName.escapedText;
        if (escapedText === "Promise") {
          return { type: AstNodeType.PromiseType, generic: this.mapTypesToParamType((type as any).typeArguments[0]) };
        } else if (escapedText === "Array") {
          return { type: AstNodeType.ArrayType, generic: this.mapTypesToParamType((type as any).typeArguments[0]) };
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
              type: this.mapTypesToParamType(member.type)
            };
            properties.push(property);
          }
        }
        return { type: AstNodeType.TypeLiteral, properties: properties };
      }
      case typescript.SyntaxKind.UnionType: {
        const params: Node[] = [];
        for (const typeNode of (type as any).types) {
          params.push(this.mapTypesToParamType(typeNode));
        }
        return { type: AstNodeType.UnionType, params: params };
      }
      default:
        return { type: AstNodeType.AnyLiteral };
    }
  }

  parseClassDeclaration(classDeclaration: typescript.Node): ClassDefinition | undefined {
    const copy: any = { ...classDeclaration };
    if (copy.modifiers) {
      for (const modifier of copy.modifiers) {
        if (modifier.kind === typescript.SyntaxKind.ExportKeyword) {
          const methods: MethodDefinition[] = [];
          for (const member of copy.members) {
            if (typescript.isMethodDeclaration(member)) {
              const memberCopy: any = { ...member };
              const method = this.parseMethodSignature(memberCopy);
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

  parseMethodSignature(methodSignature: typescript.Node): MethodDefinition | undefined {
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
            paramType: this.mapTypesToParamType(parameter.type),
            optional: parameter.questionToken ? true : false,
            defaultValue: parameter.initializer ? {value: parameter.initializer.text, type: parameter.initializer.kind === 10 ? AstNodeType.StringLiteral : AstNodeType.DoubleLiteral} : undefined
          }
          parameters.push(param);
        }
      }
    }
    return {
      type: AstNodeType.MethodDefinition,
      name: methodSignatureCopy.name.escapedText,
      params: parameters,
      returnType: methodSignatureCopy.type ? this.mapTypesToParamType(methodSignatureCopy.type) : { type: AstNodeType.AnyLiteral },
      static: false,
      kind: MethodKindEnum.method
    }
  }

  parseEnumDeclaration(enumDeclaration: typescript.Node): Enum {
    const enumDeclarationCopy: any = { ...enumDeclaration };
    return {
      type: AstNodeType.Enum,
      name: enumDeclarationCopy.name.escapedText,
      cases: enumDeclarationCopy.members.map((member: any) => member.name.escapedText)
    }
  }

  parseTypeAliasDeclaration(typeAliasDeclaration: typescript.Node): StructLiteral | TypeAlias {
    const typeAliasDeclarationCopy: any = { ...typeAliasDeclaration };
    if (typeAliasDeclarationCopy.type.kind === typescript.SyntaxKind.TypeLiteral) {
      const structLiteral: StructLiteral = {
        type: AstNodeType.StructLiteral,
        name: typeAliasDeclarationCopy.name.escapedText,
        typeLiteral: {
          type: AstNodeType.TypeLiteral,
          properties: []
        }
      }
      for (const member of typeAliasDeclarationCopy.type.members) {
        if (member.type) {
          const field: PropertyDefinition = {
            name: member.name.escapedText,
            optional: member.questionToken ? true : false,
            type: this.mapTypesToParamType(member.type),
          }
          structLiteral.typeLiteral.properties.push(field);
        }
      }
      return structLiteral;
    } else {
      return {
        type: AstNodeType.TypeAlias,
        name: typeAliasDeclarationCopy.name.escapedText,
        aliasType: this.mapTypesToParamType(typeAliasDeclarationCopy.type)
      }
    }
  }

  async generateAst(input: AstGeneratorInput): Promise<AstGeneratorOutput> {
    const fileData = input.class.data;

    const node = typescript.createSourceFile('test.ts', fileData.toString(), typescript.ScriptTarget.ES2015, true, typescript.ScriptKind.TS);
    let classDefinition: ClassDefinition | undefined = undefined;
    const declarations: Node[] = [];
    node.forEachChild((child) => {
      if (typescript.isEnumDeclaration(child)) {
        const enumDeclaration =  this.parseEnumDeclaration(child);
        declarations.push(enumDeclaration);
      } else if (typescript.isClassDeclaration(child)) {
        const classDeclaration = this.parseClassDeclaration(child);
        if (classDeclaration && !classDefinition) {
          classDefinition = classDeclaration;
        }
      } else if (typescript.isTypeAliasDeclaration(child)) {
        const typeAliasDeclaration = this.parseTypeAliasDeclaration(child);
        declarations.push(typeAliasDeclaration);
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