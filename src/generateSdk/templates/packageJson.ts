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
    projectName: string,
    region: string,
    stage: string,
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
            packageJsonStr = getNodeModulePackageJsonLocal(projectName, region);
        } else {
            packageJsonStr = getNodeModulePackageJson(projectName, region, stage);
        }
    }

    const packageJson = JSON.parse(packageJsonStr);

    packageJson.main = "./cjs/index.js";
    packageJson.module = "./esm/index.js";

    return JSON.stringify(packageJson, null, 2);
};

export const getNodeModulePackageJsonLocal = (projectName: string, region: string): string => `{
  "name": "@genezio-sdk/${projectName}_${region}",
  "version": "${getRandomSemVer()}",
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

export const getNodeModulePackageJson = (
    projectName: string,
    region: string,
    stage: string,
): string => `{
  "name": "@genezio-sdk/${projectName}_${region}",
  "version": "1.0.0-${stage}",
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
