export default class FileDetails {
    name: string
    extension: string
    path: string
    filename: string // Includes extensions

    constructor(name: string, extension: string, path: string, filename: string) {
        this.name = name
        this.extension = extension
        this.path = path
        this.filename = filename
    }
}