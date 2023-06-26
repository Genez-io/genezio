import { TriggerType } from "./yamlProjectConfiguration.js";

export type AstSummaryParam = {
  name: string;
  type: string;
};

export type AstSummaryMethod = {
  name: string;
  type: TriggerType;
  params: AstSummaryParam[];
};

export type AstSummaryClass = {
  name: string;
  path: string;
  language: string,
  methods: AstSummaryMethod[];
};

export type AstSummary = {
  version: string;
  classes: AstSummaryClass[];
};
