export const getNodeModulePackageJsonLocal = (
  projectName: string,
  region: string,
): string => `{
  "name": "@genezio-sdk/${projectName}_${region}",
  "version": "1.0.0",
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
