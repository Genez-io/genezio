import { Env, Remote } from "./remote.js"

export class Task {
    static remote = new Remote("https://eerl6g62cgzwmhpdtz4loug2u40ysnhl.lambda-url.us-east-1.on.aws/")

    static async connect() {
        return Task.remote.call("Task.connect")  
    }
    
    static async getAllByUser(token, userId) {
        return Task.remote.call("Task.getAllByUser", token, userId)  
    }

    static async createTask(token, title, ownerId) {
        return Task.remote.call("Task.createTask", token, title, ownerId)  
    }

    static async updateTask(token, id, title, solved) {
        return Task.remote.call("Task.updateTask", token, id, title, solved)  
    }

    static async deleteTask(token, id) {
        return Task.remote.call("Task.deleteTask", token, id)  
    }

    
}

export { Env, Remote };
