import { YamlClassConfiguration } from "./yamlProjectConfiguration";


export class File {
  path: string
  data: string

  constructor(path: string, data: string) {
      this.path = path
      this.data = data
  }
}

export class SdkFileClass {
  path: string
  data: string
  className: string

  constructor(path: string, data: string, className: string) {
    this.path = path
    this.data = data
    this.className = className
  }
}

export enum AstNodeType {
  StringLiteral = "StringLiteral",
  IntegerLiteral = "IntegerLiteral",
  BooleanLiteral = "BooleanLiteral",
  FloatLiteral = "FloatLiteral",
  NullLiteral = "NullLiteral",
  DoubleLiteral = "DoubleLiteral",
  VoidLiteral = "VoidLiteral",
  AnyLiteral = "AnyLiteral",
  ArrayType = "ArrayType",
  MapType = "MapType",
  PromiseType = "PromiseType",
  ConstType = "ConstType",
  NativeType = "NativeType",
  ParamType = "ParamType",
  CustomNodeLiteral = "CustomNodeLiteral",
  Enum = "Enum",
  TypeAlias = "TypeAlias",
  TypeLiteral = "TypeLiteral",
  StructLiteral = "StructLiteral",
  UnionType = "UnionType",
  ParameterDefinition = "ParameterDefinition",
  MethodDefinition = "MethodDefinition",
  ClassDefinition = "ClassDefinition",
  PropertyDefinition = "PropertyDefinition"
}

export interface CustomAstNodeType extends Node {
  type: AstNodeType.CustomNodeLiteral;
  rawValue: string;
}

export enum SourceType {
  script = "script",
  module = "module"
}

export enum MethodKindEnum {
  constructor = "constructor",
  method = "method",
  get = "get",
  set = "set"
}

/**
 * The input that goes into the astGenerator.
 */
export type AstGeneratorInput = {
  class: {
    path: string;
    data: string;
    name?: string;
  };
};

export type AstGeneratorOutput = {
  program: Program;
};

export interface Node {
  type: AstNodeType;
}

// DONE native types, enums, type alias, union type - type | type
// TODO next steps - array(multi level), map

export interface ConstType extends Node {
  type: AstNodeType.ConstType;
  name: string;
  value: string;
}

export interface StringType extends Node {
  type: AstNodeType.StringLiteral;
}

export interface IntegerType extends Node {
  type: AstNodeType.IntegerLiteral;
}

export interface BooleanType extends Node {
  type: AstNodeType.BooleanLiteral;
}

export interface FloatType extends Node {
  type: AstNodeType.FloatLiteral;
}

export interface DoubleType extends Node {
  type: AstNodeType.DoubleLiteral;
}

export interface VoidType extends Node {
  type: AstNodeType.VoidLiteral;
}

export interface NullType extends Node {
  type: AstNodeType.NullLiteral;
}

export interface AnyType extends Node {
  type: AstNodeType.AnyLiteral;
}

export interface ArrayType extends Node {
  type: AstNodeType.ArrayType;
  generic: Node;
}

export interface MapType extends Node {
  type: AstNodeType.MapType;
  genericKey: Node;
  genericValue: Node;
}

export interface PromiseType extends Node {
  type: AstNodeType.PromiseType;
  generic: Node;
}

export interface Enum extends Node {
  type: AstNodeType.Enum;
  name: string;
  cases: string[];
}

export interface PropertyDefinition {
  name: string;
  optional: boolean;
  type: DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | TypeLiteral | CustomAstNodeType | ArrayType | UnionType | PromiseType | VoidType;
}

export interface TypeLiteral extends Node {
  type: AstNodeType.TypeLiteral;
  properties: PropertyDefinition[];
}

export interface StructLiteral extends Node {
  type: AstNodeType.StructLiteral;
  name: string;
  typeLiteral: TypeLiteral;
}

export interface TypeAlias extends Node {
  type: AstNodeType.TypeAlias;
  name: string;
  aliasType: DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | CustomAstNodeType | ArrayType | TypeLiteral | UnionType | PromiseType | VoidType;
}

export interface UnionType extends Node {
  type: AstNodeType.UnionType;
  params: Node[];
}

export interface ParameterDefinition extends Node {
  type: AstNodeType.ParameterDefinition;
  name: string;
  rawType: string;
  paramType: DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | ArrayType | MapType | CustomAstNodeType | TypeLiteral | UnionType | PromiseType | VoidType;
  optional: boolean;
  defaultValue?: {
    value: string;
    type: AstNodeType;
  };
}

export interface MethodDefinition extends Node {
  type: AstNodeType.MethodDefinition;
  name: string;
  params: ParameterDefinition[];
  kind: MethodKindEnum;
  static: boolean;
  returnType: DoubleType | IntegerType | StringType | BooleanType | FloatType | AnyType | ArrayType | MapType | CustomAstNodeType | TypeLiteral | UnionType | PromiseType | VoidType;
}

export interface ClassDefinition extends Node {
  type: AstNodeType.ClassDefinition;
  name: string;
  methods: MethodDefinition[];
}

export type Program = {
  originalLanguage: string;
  sourceType: SourceType;
  body: (ClassDefinition | Node)[] | undefined;
}

/**
 * A class implementing this interface will create the ast for a given language.
 */
export interface AstGeneratorInterface {
  generateAst: (input: AstGeneratorInput) => Promise<AstGeneratorOutput>;
}


// types for SDK Generator
export type SdkGeneratorClassesInfoInput = {
  program: Program;
  classConfiguration: YamlClassConfiguration;
  fileName: string;
};

export type SdkGeneratorInput = {
  classesInfo: SdkGeneratorClassesInfoInput[];
  sdk: {
    language: string;
  }
};

export type SdkGeneratorOutput = {
  files: SdkFileClass[];
}


/**
 * A class implementing this interface will create the sdk for a given language.
 */
export interface SdkGeneratorInterface {
  generateSdk: (
    sdkGeneratorInput: SdkGeneratorInput
  ) => Promise<SdkGeneratorOutput>;
}
