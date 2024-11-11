// This file contains patterns for detecting important files using a `grep` strategy

// We should take into account:
//  * common methods called to instantiate servers/conections/components such as app.listen()
//  * common imports such as import Fastify from 'fastify' or require('fastify') (ESM and CJS)

// For each file there is a list of patterns all conditions should be matched to consider the file as a candidate

export const FASTIFY_PATTERN = [
    /app\.listen|fastify\.listen/,
    /import\s+Fastify\s+from\s+['"]fastify['"]|import\s+fastify\s+from\s+['"]fastify['"]|require\(['"]fastify['"]\)/,
];

export const EXPRESS_PATTERN = [
    /app\.listen/,
    /import\s+express\s+from\s+['"]express['"]|require\(['"]express['"]\)/,
];

export const SERVERLESS_HTTP_PATTERN = [
    /import\s+Serverless\s+from\s+['"]serverless-http['"]|import\s+serverless\s+from\s+['"]serverless-http['"]|require\(['"]serverless-http['"]\)/,
];
