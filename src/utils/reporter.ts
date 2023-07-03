import log from "loglevel";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse.js";
import { TriggerType } from "../models/yamlProjectConfiguration.js";
import { GenezioCloudResultClass } from "../cloudAdapter/cloudAdapter.js";

export function reportSuccess(
  classesInfo: GenezioCloudResultClass[],
  sdkResponse: SdkGeneratorResponse,
) {
  if (sdkResponse.files.length > 0) {
    log.info(
      "\x1b[36m%s\x1b[0m",
      "Your code was deployed and the SDK was successfully generated!"
    );
  } else {
    log.info(
      "\x1b[36m%s\x1b[0m",
      "Your code was successfully deployed!"
    );
  }

  // print function urls
  let printHttpString = "";

  classesInfo.forEach((classInfo) => {
    classInfo.methods.forEach((method) => {
      if (method.type === TriggerType.http) {
        printHttpString +=
          `  - ${classInfo.className}.${method.name}: ${method.functionUrl}` +
          "\n";
      }
    });
  });

  if (printHttpString !== "") {
    log.info("");
    log.info("HTTP Methods Deployed:");
    log.info(printHttpString);
  }
}