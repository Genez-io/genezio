import { TriggerType } from "./yamlProjectConfiguration.js";

export type AstSummaryParam = {
  name: string;
  type: Object;
  optional: boolean;
};

export type AstSummaryMethod = {
  name: string;
  type: TriggerType;
  params: AstSummaryParam[];
  returnType: Object;
};

export type AstSummaryClass = {
  name: string;
  path: string;
  language: string;
  types: Object[];
  methods: AstSummaryMethod[];
};

export type AstSummary = {
  version: string;
  classes: AstSummaryClass[];
};
