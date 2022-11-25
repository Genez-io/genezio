export const tsconfig = {
    compilerOptions: {
        target: "es6",
        module: "commonjs",
        lib: [
            "es6",
            "dom"
        ],
        outDir: "build",
        rootDir: ".",
        strict: true,
        noImplicitAny: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        allowJs: true
    },
    //files: ["hello.ts"],
    include: [""],
};

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
}`
