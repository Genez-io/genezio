import { TriggerType } from "./projectConfiguration";

export type AstSummaryParam = {
  name: string;
};

export type AstSummaryMethod = {
  name: string;
  type: TriggerType;
  params: AstSummaryParam[];
};

export type AstSummaryClass = {
  name: string;
  methods: AstSummaryMethod[];
};

export type AstSummary = {
  version: string;
  classes: AstSummaryClass[];
};
