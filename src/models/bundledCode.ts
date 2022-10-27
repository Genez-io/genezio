
export default class BundledCode {
    path: string
    className: string
    functionNames: string[]
    dependencies: []

    constructor(path: string, className: string, functionNames: string[], dependencies: []) {
        this.path = path
        this.className = className
        this.functionNames = functionNames
        this.dependencies = dependencies
    }
}