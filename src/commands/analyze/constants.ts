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

export const FLASK_PATTERN = [
    /from\s+flask\s+import\s+Flask|import\s+flask/,
    /\w+\s*=\s*[Ff]lask\(__name__\)/,
];

export const DJANGO_PATTERN = [
    /from\s+django\.core\.wsgi\s+import\s+get_wsgi_application|from\s+django\.core\.asgi\s+import\s+get_asgi_application/,
    /application\s*=\s*get_wsgi_application\(\)|application\s*=\s*get_asgi_application\(\)/,
];

export const PYTHON_LAMBDA_PATTERN = [/def\s+handler\s*\(\s*event\s*\):/];

export const FASTAPI_PATTERN = [
    /\w+\s*=\s*FastAPI\(\)/,
    /from\s+fastapi\s+import\s+FastAPI|import\s+fastapi/,
];
