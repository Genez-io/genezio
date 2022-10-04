export default class Handler {
    path: string
    object: any
    functionName: any

    constructor(path: string, object: any, functionName: any) {
        this.path = path
        this.object = object
        this.functionName = functionName
    }
}