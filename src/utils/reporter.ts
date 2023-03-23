import log from "loglevel";
import { SdkGeneratorResponse } from "../models/sdkGeneratorResponse";
import { TriggerType } from "../models/yamlProjectConfiguration";

export function reportSuccess(
  classesInfo: any,
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

  classesInfo.forEach((classInfo: any) => {
    classInfo.methods.forEach((method: any) => {
      if (method.type === TriggerType.http) {
        printHttpString +=
          `  - ${classInfo.className}.${method.name}: ${classInfo.functionUrl}${classInfo.className}/${method.name}` +
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