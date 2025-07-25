export const tsconfig = {
    compilerOptions: {
        target: "ES2020",
        module: "ES2020",
        moduleResolution: "node",
        lib: ["es6", "dom"],
        outDir: "build",
        rootDir: ".",
        strict: true,
        noImplicitAny: true,
        esModuleInterop: true,
        resolveJsonModule: true,
        allowJs: true,
        types: ["node"],
        skipLibCheck: true,
    },
    include: ["**/*"],
};

export const legacyRegions = [
    { name: "US East (N. Virginia)", value: "us-east-1" },
    { name: "US East (Ohio)", value: "us-east-2" },
    { name: "US West (N. California)", value: "us-west-1" },
    { name: "US West (Oregon)", value: "us-west-2" },
    { name: "Asia Pacific (Mumbai)", value: "ap-south-1" },
    { name: "Asia Pacific (Osaka)", value: "ap-northeast-3" },
    { name: "Asia Pacific (Seoul)", value: "ap-northeast-2" },
    { name: "Asia Pacific (Singapore)", value: "ap-southeast-1" },
    { name: "Asia Pacific (Sydney)", value: "ap-southeast-2" },
    { name: "Asia Pacific (Tokyo)", value: "ap-northeast-1" },
    { name: "Canada (Central)", value: "ca-central-1" },
    { name: "Europe (Frankfurt)", value: "eu-central-1" },
    { name: "Europe (Ireland)", value: "eu-west-1" },
    { name: "Europe (London)", value: "eu-west-2" },
    { name: "Europe (Paris)", value: "eu-west-3" },
    { name: "Europe (Stockholm)", value: "eu-north-1" },
    { name: "South America (São Paulo)", value: "sa-east-1" },
] as const;

export const regions = [
    { name: "US East (N. Virginia)", value: "us-east-1" },
    { name: "Europe (Frankfurt)", value: "eu-central-1" },
];

export const neonDatabaseRegions = [
    { name: "US East (N. Virginia)", value: "us-east-1" },
    { name: "US East (Ohio)", value: "us-east-2" },
    { name: "US West (Oregon)", value: "us-west-2" },
    { name: "Asia Pacific (Singapore)", value: "ap-southeast-1" },
    { name: "Asia Pacific (Sydney)", value: "ap-southeast-2" },
    { name: "Europe (Frankfurt)", value: "eu-central-1" },
];

export const mongoDatabaseRegions = [
    { name: "US East (N. Virginia)", value: "us-east-1" },
    { name: "Europe (Frankfurt)", value: "eu-central-1" },
];
