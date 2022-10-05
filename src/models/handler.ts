export default class Handler {
    path: string
    object: any
    className: string
    functionName: any

    constructor(path: string, object: any, className: string, functionName: any) {
        this.path = path
        this.object = object
        this.className = className
        this.functionName = functionName
    }
}