export const nodeSdkTs = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

let http: any = null;
let https: any = null;
let importDone: boolean = false;

async function importModules() {
    if (typeof process !== "undefined" && process.versions != null && process.versions.node != null) {
        const httpModule: string = 'http';
        http = await import(httpModule);
        const httpsModule: string = 'https';
        https = await import(httpsModule);
    }
    importDone = true;
}

async function makeRequestBrowser(request: any, url: any) {
    // @ts-ignore
    const response = await fetch(\`\${url}\`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
    });

    if (!response.ok) {
        return response.json().then((error) => Promise.reject(error));
    }

    return response.json();
}

async function makeRequestNode(request: any, url: any, agent: any) {

    const data = JSON.stringify(request);
    const hostUrl = new URL(url);

    const options = {
        hostname: hostUrl.hostname,
        path: hostUrl.search ? hostUrl.pathname + hostUrl.search : hostUrl.pathname,
        port: hostUrl.port,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
        },
        agent: agent,
    };
    const client = url.includes('https') ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.request(options, (res: any)=> {
            let body = '';

            res.on('data', (d: any) => {
                body += d
            });
            res.on('end', async function() {
                const response = JSON.parse(body);
                resolve(response);
            });

        });

        req.on('error', (error: any) => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

/**
 * The class through which all request to the Genezio backend will be passed.
 *
 */
 export class Remote {
    url: any = undefined;
    agent: any = undefined;

    constructor(url: any) {
        this.url = url;
        if (http !== null && https !== null) {
            const client = url.includes("https") ? https : http;
            this.agent = new client.Agent({ keepAlive: true });
        }
    }

    async call(method: any, ...args: any[]) {
        const requestContent = {"jsonrpc": "2.0", "method": method, "params": args, "id": 3};
        let response: any = undefined;
        if (!importDone) {
            await importModules();
        }

        if (http !== null && https !== null) {
            response = await makeRequestNode(requestContent, this.url, this.agent);
        } else {
            response = await makeRequestBrowser(requestContent, this.url);
        }

        if (response.error) {
            return response.error.message;
        }

        return response.result;
    }
}
`;
