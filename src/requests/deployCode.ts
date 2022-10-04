import path from 'path'
import FormData from 'form-data'
import fs from 'fs'
import axios from 'axios'
import BundledCode from '../models/bundledCode';


export default async function deployCode(bundledCode: BundledCode, filePath: string, extension: string, runtime: string) {
    var form = new FormData()
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

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message)
    }

    return response.data.functionUrl;
}