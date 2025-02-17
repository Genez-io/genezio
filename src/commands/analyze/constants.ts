// This file contains patterns for detecting important files using a `grep` strategy

// We should take into account:
//  * common methods called to instantiate servers/conections/components such as app.listen()
//  * common imports such as import Fastify from 'fastify' or require('fastify') (ESM and CJS)

// For each file there is a list of patterns all conditions should be matched to consider the file as a candidate

export const FASTIFY_PATTERN = [
    /app\.listen|fastify\.listen/,
    /import\s+Fastify\s+from\s+['"]fastify['"]|import\s+fastify\s+from\s+['"]fastify['"]|require\(['"]fastify['"]\)/,
];

export const EXPRESS_PATTERN = [/app\.listen/, /import.*from\s+['"]express['"]/];

export const SERVERLESS_HTTP_PATTERN = [
    /import\s+Serverless\s+from\s+['"]serverless-http['"]|import\s+serverless\s+from\s+['"]serverless-http['"]|require\(['"]serverless-http['"]\)/,
];

export const FLASK_PATTERN = [
    /from\s+flask\s+import\s+Flask|import\s+flask/,
    /\w+\s*=\s*[Ff]lask\(\s*__name__[^)]*\)/,
];

export const DJANGO_PATTERN = [
    /from\s+django\.core\.wsgi\s+import\s+get_wsgi_application|from\s+django\.core\.asgi\s+import\s+get_asgi_application/,
    /application\s*=\s*get_wsgi_application\([^)]*\)|application\s*=\s*get_asgi_application\([^)]*\)/,
];

export const PYTHON_LAMBDA_PATTERN = [/def\s+handler\s*\(\s*event\s*\):/];

export const FASTAPI_PATTERN = [
    /\w+\s*=\s*FastAPI\([^)]*\)/,
    /from\s+fastapi\s+import\s+FastAPI|import\s+fastapi/,
];

export const STREAMLIT_PATTERN = [/import\s+streamlit(?:\s+as\s+st)?|from\s+streamlit\s+import/];

// Agent Prompts
export const ENVIRONMENT_ANALYZE_PROMPT = `Your task is to analyze the following .env.example file and provide values as best as you can.

{{injectedServices}}

This is the .env.example:

{{contents}}

Analyze the file and provide the following information for each environment variable:
- key: The name of the environment variable
- defaultValue: The default value of the environment variable - try and provide a value that is most likely to be used
- aboveComment(optional): A helpful description of what this environment variable does
- link(optional): A link to the documentation on how to retrieve this environment variable if it's not possible to provide a default value. This is an optional value. If you already have a default value, provide "" for link.
- genezioProvisioned: If the environment variable is for a service that is provisioned by Genezio, set this to true. If not, set this to false.

There are a few tips to keep in mind:
1. If the environment variable is a postgres database - you can provide the following \`\${{services.databases.<database-name>.uri}}\` because it's provisioned by Genezio
2. If the environment variable is a mongo database - you can provide the following \`\${{services.databases.<database-name>.uri}}\` because it's provisioned by Genezio
3. If the environment variable has to be random secret string, generate a random string with the proper length

`;
export const INJECT_SERVICES = `You are also given a list of services that are provisioned by Genezio.
You can use the following services to provide values for the environment variables.

The services are:
{{services}}
`;
export const SYSTEM_ENVIRONMENT_ANALYZE_PROMPT = `Your task is to analyze the following system environment variables and provide values as best as you can.`;
