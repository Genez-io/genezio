export const getNodeModulePackageJson = (projectName: string): string => `{
  "name": "@genezio/${projectName}",
  "version": "1.0.0",
  "description": "",
  "main": "./cjs/index.js",
  "module": "./esm/index.js"
}
`;
