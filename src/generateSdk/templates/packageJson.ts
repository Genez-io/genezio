function getRandomSemVer() {
    const major = Math.floor(Math.random() * 10); // Random major version between 0 and 9
    const minor = Math.floor(Math.random() * 10); // Random minor version between 0 and 9
    const patch = Math.floor(Math.random() * 10); // Random patch version between 0 and 9

    return `${major}.${minor}.${patch}-local`;
}

export const getNodeModulePackageJsonLocal = (projectName: string, region: string): string => `{
  "name": "@genezio-sdk/${projectName}_${region}",
  "version": "${getRandomSemVer()}",
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
  "description": "",
  "main": "./cjs/index.js",
  "module": "./esm/index.js"
}
`;
