import { Remote } from "./remote.js"

export type Task = {
  _id: string,
  title: string,
  ownerId: string,
  solved: boolean,
  date: Date,
};

export type GetTasksResponse = {
  success: boolean,
  tasks: Task[]
};

export type GetTaskResponse = {
  success: boolean,
  task?: Task
};

export type UpdateTaskResponse = {
  success: boolean,
};

export type DeleteTaskResponse = {
  success: boolean,
};


export class TaskService {
    static remote = new Remote("https://3yliuslxs242nwksjoxbfjtnx40zclud.lambda-url.us-east-1.on.aws/")

    static async connect()  {
        return TaskService.remote.call("TaskService.connect")
    }
      
    static async getAllByUser(token: string, userId: string): Promise<GetTasksResponse> {
        return TaskService.remote.call("TaskService.getAllByUser", token, userId)  
    }
  
    static async createTask(token: string, title: string, ownerId: string): Promise<GetTaskResponse> {
        return TaskService.remote.call("TaskService.createTask", token, title, ownerId)  
    }
  
    static async updateTask(token: string, id: string, title: string, solved: boolean): Promise<UpdateTaskResponse> {
        return TaskService.remote.call("TaskService.updateTask", token, id, title, solved)  
    }
  
    static async deleteTask(token: string, id: string): Promise<DeleteTaskResponse> {
        return TaskService.remote.call("TaskService.deleteTask", token, id)  
    }
  
    
}

export { Remote };
