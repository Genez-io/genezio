import boxen from "boxen";
import colors from "colors";
import { compare } from 'compare-versions';
import latestVersion from "latest-version";
import log from "loglevel";
import { createRequire } from "module";
const requireESM = createRequire(import.meta.url);

const pjson = requireESM("../../package.json");
const currentGenezioVersion = pjson.version;

const latestGenezioVersionPromise = latestVersion("genezio");

export default currentGenezioVersion;

export async function logOutdatedVersion() {
  const latestGenezioVersion = await latestGenezioVersionPromise;
  if (compare(latestGenezioVersion, currentGenezioVersion, ">")) {
    log.info(
      boxen(
        `Update available ${colors.grey(
          currentGenezioVersion
        )} → ${colors.magenta(latestGenezioVersion)}\nRun ${colors.green(
          "npm i -g genezio"
        )} to update`,
        { padding: 1, margin: 1, borderStyle: "round", borderColor: "magentaBright" }
      )
    );
  }
}
