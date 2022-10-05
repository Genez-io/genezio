import path from 'path'
import FormData from 'form-data'
import fs from 'fs'
import axios from 'axios'
import BundledCode from '../models/bundledCode';
import { readToken } from '../utils/file';


export default async function deployCode(bundledCode: BundledCode, filePath: string, extension: string, runtime: string) {
    var form = new FormData()
    const token = await readToken().catch(() => undefined);

    if (!token) {
        throw new Error("We are currently in the early access phase of our project. Run 'genezio login <code>' before you deploy your function. If you don't have a code, contact us at contact@genez.io.")
    }

    form.append("token", token)
    form.append('bundledFile', fs.createReadStream(bundledCode.path))
    form.append('file', fs.createReadStream(filePath))
    form.append('filename', path.parse(filePath).name)
    form.append('extension', extension)
    form.append('runtime', runtime)

    const response: any = await axios({
        method: "post",
        url: "https://haavwx62n4.execute-api.us-east-1.amazonaws.com/js/deploy",
        data: form,
        headers: form.getHeaders()
    }).catch((error: Error) => {
        throw error
    });

    if (response.data.status === "error") {
        throw new Error(response.data.message)
    }

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message)
    }

    return response.data.functionUrl;
}