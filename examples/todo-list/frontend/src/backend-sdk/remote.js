/**
* This is an auto generated code. This code should not be modified since the file can be overwriten 
* if new genezio commands are executed.
*/

async function makeRequest(request, url, port) {
    const response = await fetch(`${url}:${port}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request)
    });
    return response.json();
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
