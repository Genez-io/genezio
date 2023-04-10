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
          const memberCopy: any = { ...member };
          delete memberCopy.parent;
          delete memberCopy.name.parent;
          if (memberCopy.type) {
            delete memberCopy.type.parent;
            const property: PropertyDefinition = {
              name: memberCopy.name.escapedText,
              type: this.mapTypesToParamType(memberCopy.type)
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
    delete copy.parent;
    delete copy.name.parent;
    if (copy.modifiers) {
      delete copy.modifiers.parent;
      for (const modifier of copy.modifiers) {
        delete modifier.parent;
        if (modifier.kind === typescript.SyntaxKind.ExportKeyword) {
          const methods: MethodDefinition[] = [];
          for (const member of copy.members) {
            if (typescript.isMethodDeclaration(member)) {
              const memberCopy: any = { ...member };
              delete memberCopy.parent;
              const method = this.parseMethodSignature(memberCopy);
              methods.push(method);
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

  parseMethodSignature(methodSignature: typescript.Node): MethodDefinition {
    const parameters: ParameterDefinition[] = [];
    const methodSignatureCopy: any = { ...methodSignature };
    delete methodSignatureCopy.parent;
    delete methodSignatureCopy.name.parent;
    if (methodSignatureCopy.modifiers) {
      delete methodSignatureCopy.modifiers.parent;
      for (const modifier of methodSignatureCopy.modifiers) {
        delete modifier.parent;
      }
    }
    if (methodSignatureCopy.type) {
      delete methodSignatureCopy.type.parent;
    }
    if (methodSignatureCopy.parameters) {
      delete methodSignatureCopy.parameters.parent;
      for (const parameter of methodSignatureCopy.parameters) {
        delete parameter.parent;
        delete parameter.name.parent;
        if (parameter.type) {
          delete parameter.type.parent;
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
    //console.log("METHOD SIGNATURE:", methodSignatureCopy);
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
    delete enumDeclarationCopy.parent;
    delete enumDeclarationCopy.name.parent;
    if (enumDeclarationCopy.modifiers) {
      delete enumDeclarationCopy.modifiers.parent;
      for (const modifier of enumDeclarationCopy.modifiers) {
        delete modifier.parent;
      }
    }
    if (enumDeclarationCopy.members) {
      delete enumDeclarationCopy.members.parent;
      for (const member of enumDeclarationCopy.members) {
        delete member.parent;
        delete member.name.parent;
      }
    }
    //console.log("ENUM DECLARATION:", enumDeclarationCopy);
    return {
      type: AstNodeType.Enum,
      name: enumDeclarationCopy.name.escapedText,
      cases: enumDeclarationCopy.members.map((member: any) => member.name.escapedText)
    }
  }

  parseTypeAliasDeclaration(typeAliasDeclaration: typescript.Node): StructLiteral | TypeAlias {
    const typeAliasDeclarationCopy: any = { ...typeAliasDeclaration };
    delete typeAliasDeclarationCopy.parent;
    delete typeAliasDeclarationCopy.name.parent;
    if (typeAliasDeclarationCopy.modifiers) {
      delete typeAliasDeclarationCopy.modifiers.parent;
      for (const modifier of typeAliasDeclarationCopy.modifiers) {
        delete modifier.parent;
      }
    }
    if (typeAliasDeclarationCopy.type) {
      delete typeAliasDeclarationCopy.type.parent;
    }
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
        delete member.parent;
        delete member.name.parent;
        if (member.type) {
          delete member.type.parent;
          const field: PropertyDefinition = {
            name: member.name.escapedText,
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
    const fileData = input.file.data;

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