
export default class BundledCode {
    path: string
    className: string
    functionNames: string[]

    constructor(path: string, className: string, functionNames: string[]) {
        this.path = path
        this.className = className
        this.functionNames = functionNames
    }
}