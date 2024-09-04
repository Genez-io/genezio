/**
 * This is an auto generated code. This code should not be modified since the file can be overwritten
 * if new genezio commands are executed.
 */

const replacer = (_: string, value: any) =>
    typeof value === "bigint" ? { $bigint: value.toString() } : value;

const reviver = (_: string, value: any) =>
    value !== null &&
    typeof value === "object" &&
    "$bigint" in value &&
    typeof value.$bigint === "string"
        ? BigInt(value.$bigint)
        : value;

async function makeRequestBrowser(request: any, url: any) {
    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(request, replacer),
    });

    const textBody = await response.text();

    return JSON.parse(textBody, reviver);
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
