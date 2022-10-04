const readline = require('readline')
import path from 'path'
import { getFileDetails } from './file';


export async function askQuestion(question: string, defaultValue?: string): Promise<string> {
    var rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    const defaultOutputPath = path.resolve('.');

    return new Promise((resolve, reject) => {
        rl.question(question, function (input: string) {
            if (input.length === 0 && defaultValue) {
                resolve(defaultValue)
            } else {
                resolve(input)
            }
            rl.close()
        })
    })
}