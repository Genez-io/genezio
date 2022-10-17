export default class User {
    email: string
    name: string
    profileUrl: string

    constructor(email: string, name: string, profileUrl: string) {
        this.email = email
        this.name = name
        this.profileUrl = profileUrl
    }
}
