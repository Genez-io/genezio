import path from "path";
import { GenezioCommand } from "../../utils/reporter.js";
import fs from "fs";
function getRandomSemVer() {
    const major = Math.floor(Math.random() * 10); // Random major version between 0 and 9
    const minor = Math.floor(Math.random() * 10); // Random minor version between 0 and 9
    const patch = Math.floor(Math.random() * 10); // Random patch version between 0 and 9

    return `${major}.${minor}.${patch}-local`;
}

export const getPackageJsonSdkGenerator = (
    packageName: string,
    version: string,
    sdkPath: string,
    environment: GenezioCommand,
): string => {
    // check if package.json exists at sdkPath
    const packageJsonPath = path.join(sdkPath, "package.json");
    let packageJsonStr: string;
    if (fs.existsSync(packageJsonPath)) {
        // get package.json
        packageJsonStr = fs.readFileSync(packageJsonPath, "utf8");
    } else {
        if (environment === GenezioCommand.local) {
            packageJsonStr = getNodeModulePackageJsonLocal(packageName);
        } else {
            packageJsonStr = getNodeModulePackageJson(packageName, version);
        }
    }

    const packageJson = JSON.parse(packageJsonStr);

    packageJson.main = "./cjs/index.js";
    packageJson.module = "./esm/index.js";

    return JSON.stringify(packageJson, null, 2);
};

export const getNodeModulePackageJson = (packageName: string, version?: string): string => `{
  "name": "${packageName}",
  "version": "${version || getRandomSemVer()}",
  "exports": {
    ".": {
      "require": "./cjs/index.js",
      "import": "./esm/index.js"
    },
    "./remote": {
      "browser": {
        "require": "./cjs/remote.js",
        "import": "./esm/remote.js"
      },
      "default": {
        "require": "./cjs/remote.node.js",
        "import": "./esm/remote.node.js"
      }
    }
  },
  "description": "",
  "main": "./cjs/index.js",
  "module": "./esm/index.js"
}
`;
