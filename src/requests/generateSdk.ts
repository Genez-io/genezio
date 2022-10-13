import FormData from 'form-data'
import fs from 'fs'
import axios from 'axios'
import path from "path"
import { getFileDetails } from '../utils/file'


export default async function generateSdk(filePaths: string[], runtime: string, env: string, urlMap?: any) {
    var form = new FormData()
    form.append("runtime", runtime)
    form.append("env", env)

    if (urlMap) {
        form.append("urlMap", JSON.stringify(urlMap))
    }

    filePaths.forEach((filePath) => {
        const { name } = getFileDetails(filePath)

        form.append(name, fs.createReadStream(filePath))
    })

    const response: any = await axios({
        method: "post",
        url: "https://haavwx62n4.execute-api.us-east-1.amazonaws.com/js/generateSdk",
        data: form,
        headers: form.getHeaders()
    }).catch((error: Error) => {
        throw error
    });

    if (response.data?.error?.message) {
        throw new Error(response.data.error.message)
    }

    return response.data;
}