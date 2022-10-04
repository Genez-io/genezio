import { Env, Remote } from "./remote.js"

export class Task {
    static remote = new Remote(undefined)

    static async constructor() {
        return Task.remote.call("Task.constructor")  
    }
    
    static async connect() {
        return Task.remote.call("Task.connect")  
    }
    
    static async getAllByUser(userId) {
        return Task.remote.call("Task.getAllByUser", userId)  
    }

    static async create(title, ownerId) {
        return Task.remote.call("Task.create", title, ownerId)  
    }

    static async update(id, title, solved) {
        return Task.remote.call("Task.update", id, title, solved)  
    }

    static async delete(id) {
        return Task.remote.call("Task.delete", id)  
    }

    
}

export { Env, Remote };
