/**
* This is an auto generated code. This code should not be modified since the file can be overwriten 
* if new genezio commands are executed.
*/

async function makeRequest(request, url) {
    const response = await fetch(`${url}`, {
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
    url = undefined

    constructor(url) {
        this.url = url;
    }

    async call(method, ...args) {
        const requestContent = {"jsonrpc": "2.0", "method": method, "params": args, "id": 3};
        const response = await makeRequest(requestContent, this.url);

        if (response.error) {
            return response.error.message;
        }

        return response.result;
    }
}
