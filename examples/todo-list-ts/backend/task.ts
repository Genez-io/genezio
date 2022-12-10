import mongoose from "mongoose"
import { reqAuth, MONGO_DB_URI } from "./helper"
import { TaskModel } from "./models/task"

export type Task = {
  _id: string,
  title: string,
  ownerId: string,
  solved: boolean,
  date: Date,
}

export type GetTasksResponse = {
  success: boolean,
  tasks: Task[]
}

export type GetTaskResponse = {
  success: boolean,
  task?: Task
}

export type UpdateTaskResponse = {
  success: boolean,
}

export type DeleteTaskResponse = {
  success: boolean,
}

export class TaskService {
  constructor() {
    this.connect();
  }

  // connect mongoose to mongodb
  connect() {
    mongoose.connect(MONGO_DB_URI);
  }

  // get all tasks of a user
  async getAllByUser(token: string, userId: string): Promise<GetTasksResponse> {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return { success: false, tasks: [] };
    }
    const tasks = (await TaskModel.find({ ownerId: userId }))
      .map((task) => ({
        title: task.title,
        ownerId: task.ownerId,
        solved: task.solved,
        date: task.date,
        _id: task._id.toString()
      }));
    return { success: true, tasks: tasks };
  }

  // create a new task
  async createTask(token: string, title: string, ownerId: string): Promise<GetTaskResponse> {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return { success: false };
    }
    const task = await TaskModel.create({
      title: title,
      ownerId: ownerId
    });

    return {
      success: true,
      task: { title: title, ownerId: ownerId, _id: task._id.toString(), solved: false, date: new Date() }
    };
  }

  // update a task
  async updateTask(token: string, id: string, title: string, solved: boolean): Promise<UpdateTaskResponse> {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    await TaskModel.updateOne(
      { _id: id },
      {
        title: title,
        solved: solved
      }
    );

    return { success: true };
  }

  // delete a task
  async deleteTask(token: string, id: string): Promise<DeleteTaskResponse> {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    await TaskModel.deleteOne({ _id: id });

    return { success: true };
  }
}
