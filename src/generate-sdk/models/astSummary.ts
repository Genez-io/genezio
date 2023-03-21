import { Program } from "../../models/genezioModels";
import { YamlMethodConfiguration, TriggerType } from "../../models/yamlProjectConfiguration";


export type AstSummaryInfo = {
  program: Program;
  methodsMap: { [id: string]: YamlMethodConfiguration };
};
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
  methods: AstSummaryMethod[];
};

export type AstSummary = {
  version: string;
  classes: AstSummaryClass[];
};
