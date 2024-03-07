/**
 * This is an auto generated code. This code should not be modified since the file can be overwritten
 * if new genezio commands are executed.
 */

async function makeRequestBrowser(request: any, url: any) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
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
        e.stack = s.stack;
        e.info = s.info;
        e.code = s.code;
        return e;
    }

    async call(method: any, ...args: any[]) {
        const requestContent = { jsonrpc: "2.0", method: method, params: args, id: 3 };

        const response = await makeRequestBrowser(requestContent, this.url);

        if (response.error) {
            throw this.deserialize(response.error);
        }

        return response.result;
    }
}
