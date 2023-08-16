import { TriggerType } from "./yamlProjectConfiguration.js";

export type AstSummaryParam = {
  name: string;
  type: string;
  optional: boolean;
};

export type AstSummaryMethod = {
  name: string;
  type: TriggerType;
  params: AstSummaryParam[];
  returnType: string;
};

export type AstSummaryClass = {
  name: string;
  path: string;
  language: string;
  types: string[];
  methods: AstSummaryMethod[];
};

export type AstSummary = {
  version: string;
  classes: AstSummaryClass[];
};
