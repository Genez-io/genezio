/**
 * This is an auto generated code. This code should not be modified since the file can be overwriten 
 * if new genezio commands are executed.
 */

import https from 'https';
import http from 'http';

async function makeRequest(request, url, port) {

    const data = JSON.stringify(request);
    const hostUrl = new URL(url);

    const options = {
        hostname: hostUrl.hostname,
        method: 'POST',
        port,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length,
        },
    };
    const client = port === 443 ? https : http;

    return new Promise((resolve, reject) => {
        const req = client.request(options, res => {
            let body = '';

            res.on('data', d => {
                body += d
            });
            res.on('end', async function() {
                const response = JSON.parse(body);
                resolve(response);
            });

        });

        req.on('error', error => {
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

/**
 * An enum-like class that contains the values for the environments.
 */
export class Env {
    static Local = "local"
    static Production = "production"
}

/**
 * The class through which all request to the Genezio backend will be passed.
 * 
 * The "env" static property can be used to switch between different environments.
 * 
 * Example:
 * 
 * Remote.env = Env.Local; 
 * 
 * This will switch the environment to local and all the requests will go to the local server.
 * 
 */
export class Remote {
    static env = Env.Production;
    url = undefined

    constructor(url) {
        this.url = url
    }

    async call(method, ...args) {
        let url = ""
        let port = 443;

        switch (Remote.env) {
            case Env.Production:
                url = this.url;
                break;
            case Env.Local:
                url = "http://127.0.0.1"
                port = 8083
        }

        if (!url && Remote.env === Env.Production) {
            throw new Error("Run 'genezio deploy' before calling a remote endpoint on production env.")
        }

        const requestContent = {"jsonrpc": "2.0", "method": method, "params": args, "id": 3};
        const response = await makeRequest(requestContent, url, port);

        if (response.error) {
            return response.error.message;
        }

        return response.result;
    }
}
