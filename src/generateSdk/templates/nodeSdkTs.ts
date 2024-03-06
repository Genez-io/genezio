export const nodeSdkTsRemoteBrowser = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

async function makeRequestBrowser(request: any, url: any) {
    // @ts-ignore
    const response = await fetch(url, {
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

/**
 * The class through which all request to the Genezio backend will be passed.
 *
 */
 export class Remote {
    url: any = undefined;
    agent: any = undefined;

    constructor(url: any) {
        this.url = url;
    }

     deserialize(s: any) {
        const e: any = new Error(s.message);
        e.stack = s.stack
        e.info = s.info
        e.code = s.code
        return e
    }

    async call(method: any, ...args: any[]) {
        const requestContent = {"jsonrpc": "2.0", "method": method, "params": args, "id": 3};

        const response = await makeRequestBrowser(requestContent, this.url);

        if (response.error) {
            throw this.deserialize(response.error);
        }

        return response.result;
    }
}

`;

export const nodeSdkTsRemoteNode = `
/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

import * as http from 'http';
import * as https from 'https';


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
            res.on('end', function() {
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

     deserialize(s: any) {
        const e: any = new Error(s.message);
        e.stack = s.stack
        e.info = s.info
        e.code = s.code
        return e
    }

    async call(method: any, ...args: any[]) {
        const requestContent = {"jsonrpc": "2.0", "method": method, "params": args, "id": 3};
        const response: any = await makeRequestNode(requestContent, this.url, this.agent);

        if (response.error) {
            throw this.deserialize(response.error);
        }

        return response.result;
    }
}
`;

export const storageTs = `/**
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/

export interface Storage {
    setItem(key: string, value: string): void;
    
    getItem(key: string): string | null;
    
    removeItem(key: string): void;
    
    clear(): void;
}

class LocalStorageWrapper implements Storage {
  setItem(key: string, value: string): void {
    localStorage.setItem(key, value);
  }

  getItem(key: string): string | null {
    return localStorage.getItem(key);
  }

  removeItem(key: string): void {
    localStorage.removeItem(key);
  }

  clear(): void {
    localStorage.clear();
  }
}

export class StorageManager {
  private static storage: Storage|null = null;
  static getStorage(): Storage {
    if (!this.storage) {
      this.storage = new LocalStorageWrapper();
    }
    return this.storage;
  }
  static setStorage(storage: Storage): void {
    this.storage = storage;
  }
}

`;
