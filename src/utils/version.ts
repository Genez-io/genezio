import boxen from "boxen";
import colors from "colors";
import { cmp } from "semver";
import latestVersion from "latest-version";
import { log } from "./logging.js";
import { createRequire } from "module";
import { NODE_MINIMUM_VERSION } from "../constants.js";
const requireESM = createRequire(import.meta.url);

const pjson = requireESM("../../package.json");
const currentGenezioVersion = pjson.version;

const latestGenezioVersionPromise = latestVersion("genezio");

export default currentGenezioVersion;

export async function logOutdatedVersion() {
    const latestGenezioVersion = await latestGenezioVersionPromise;
    if (cmp(latestGenezioVersion, ">", currentGenezioVersion)) {
        log.info(
            boxen(
                `Update available ${colors.grey(currentGenezioVersion)} → ${colors.magenta(
                    latestGenezioVersion,
                )}\nRun ${colors.green("npm i -g genezio")} to update`,
                {
                    padding: 1,
                    margin: 1,
                    borderStyle: "round",
                    borderColor: "magentaBright",
                },
            ),
        );
    }
}

export function checkNodeMinimumVersion() {
    if (cmp(process.version, "<", NODE_MINIMUM_VERSION)) {
        throw new Error(
            `Genezio CLI requires Node.js version v${NODE_MINIMUM_VERSION} or higher. You are currently running Node.js ${process.version}. Please update your version of Node.js.`,
        );
    }
}
