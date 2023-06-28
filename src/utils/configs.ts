export const tsconfig = {
  compilerOptions: {
    target: "es6",
    lib: ["es6", "dom"],
    outDir: "build",
    rootDir: ".",
    strict: true,
    noImplicitAny: true,
    esModuleInterop: true,
    resolveJsonModule: true,
    allowJs: true,
    types: ["node"]
  },
  //files: ["hello.ts"],
  include: [""]
};

export const regions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-northeast-3",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ca-central-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "sa-east-1"
];

export const packagejson = `{
    "name": "temp-typescript",
    "version": "1.0.0",
    "description": "",
    "main": "index.js",
    "scripts": {
        "test": "echo \\"Error: no test specified\\" && exit 1"
    },
    "author": "",
    "license": "ISC",
    "dependencies": {
        "ts-loader": "^9.4.1"
    }
}`;
