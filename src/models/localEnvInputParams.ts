export default class LocalEnvInputParameters {
    // A map between file name and function URL
    functionUrlForFilePath: { [id: string]: string }

    // A map between class name and class file path
    handlers: { [id: string]: string }

    // Info about the classes.
    classesInfo: { className: any; methods: any; path: string; functionUrl: string; }[]

    constructor(
        functionurlForFilePath: { [id: string]: string },
        handlers: { [id: string]: string },
        classesInfo: { className: any; methods: any; path: string; functionUrl: string; }[]) {
        this.functionUrlForFilePath = functionurlForFilePath
        this.handlers = handlers
        this.classesInfo = classesInfo
    }
}