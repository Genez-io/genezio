import { Remote } from "./remote.js"

export class Task {
    static remote = new Remote("https://ngyetz2b5l2whssimkr2sufpw40ivkrp.lambda-url.us-east-1.on.aws/", 443)

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

export { Remote };
