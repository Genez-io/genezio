import readline from 'readline'
import path from 'path'


export async function askQuestion(question: string, defaultValue?: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })

    return new Promise((resolve) => {
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