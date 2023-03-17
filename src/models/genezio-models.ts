import { YamlClassConfiguration, YamlMethodConfiguration } from "./yamlProjectConfiguration";


export default class File {
  path: string
  data: string

  constructor(path: string, data: string) {
      this.path = path
      this.data = data
  }
}

export enum AstNodeType {
  ConstType = "ConstType",
  NativeType = "NativeType",
  ParamType = "ParamType",
  Enum = "Enum",
  TypeAlias = "TypeAlias",
  UnionType = "UnionType",
  ParameterDefinition = "ParameterDefinition",
  MethodDefinition = "MethodDefinition",
  ClassDefinition = "ClassDefinition",
  PropertyDefinition = "PropertyDefinition"
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

export enum NativeTypeEnum {
  string = "string",
  number = "number",
  boolean = "boolean",
  any = "any",
  unknown = "unknown",
  never = "never",
  null = "null",
  undefined = "undefined",
  stringArray = "string[]",
  numberArray = "number[]",
  booleanArray = "boolean[]",
  anyArray = "any[]",
  unknownArray = "unknown[]",
  neverArray = "never[]"
}

/**
 * The input that goes into the astGenerator.
 */
export type AstGeneratorInput = {
  file: File;
};

export type AstGeneratorOutput = {
  program: Program;
};

export interface Node {
  type: string;
}

// DONE native types, enums, type alias, union type - type | type
// TODO next steps - array(multi level), map

export interface TypeDefinition {
  name?: string;
  type: string;
}

export interface ConstType extends TypeDefinition {
  type: AstNodeType.ConstType;
  name: string;
  value: string;
}

export interface NativeType extends TypeDefinition {
  type: AstNodeType.NativeType; // this is the type of definition
  paramType: NativeTypeEnum | string; // this is the type of the native type
}

export interface Enum extends TypeDefinition {
  type: AstNodeType.Enum;
  name: string;
  params: TypeDefinition[];
}

export interface TypeAlias extends TypeDefinition {
  type: AstNodeType.TypeAlias;
  name: string;
  params?: TypeDefinition[];
  definition: string;
}

export interface UnionType extends TypeDefinition {
  type: AstNodeType.UnionType;
  params: TypeDefinition[];
}

export interface ParameterDefinition extends Node {
  type: AstNodeType.ParameterDefinition;
  name: string;
  rawType: string;
  paramType: TypeDefinition;
  optional: boolean;
  defaultValue?: any;
}

export interface MethodDefinition extends Node {
  type: AstNodeType.MethodDefinition;
  name: string;
  params: ParameterDefinition[];
  kind: MethodKindEnum;
  static: boolean;
  returnType: TypeDefinition;
}

export interface ClassDefinition extends Node {
  type: AstNodeType.ClassDefinition;
  name: string;
  methods: MethodDefinition[];
  typeDefinitions?: TypeAlias[];
}

export interface PropertyDefinition extends Node {
  type: AstNodeType.PropertyDefinition;
  name: string;
  params: TypeDefinition[];
  static: boolean;
  exported: boolean;
}

export interface Program {
  originalLanguage: string;
  sourceType: SourceType;
  body: [ClassDefinition | PropertyDefinition] | undefined;
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
    options: any;
  }
};

export type SdkGeneratorOutput = {
  files: File[];
}


/**
 * A class implementing this interface will create the sdk for a given language.
 */
export interface SdkGeneratorInterface {
  generateSdk: (
    sdkGeneratorInput: SdkGeneratorInput
  ) => Promise<SdkGeneratorOutput>;
}
