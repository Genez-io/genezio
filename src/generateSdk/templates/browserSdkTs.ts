export const browserSdkTs = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten 
* if new genezio commands are executed.
*/

async function makeRequest(request: any, url: any) {
    const response = await fetch(\`\${url}\`, {
        keepalive: true,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request),
    });
    return response.json();
}

/**
 * The class through which all request to the Genezio backend will be passed.
 * 
 */
export class Remote {
    url: any = undefined

    constructor(url: string) {
        this.url = url;
    }

    async call(method: any, ...args: any[]) {
        const requestContent = {"jsonrpc": "2.0", "method": method, "params": args, "id": 3};
        const response: any = await makeRequest(requestContent, this.url);

        if (response.error) {
            return response.error.message;
        }

        return response.result;
    }
}
`;
