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

/**
 * The Task server class that will be deployed on the genezio infrastructure.
 */
export class TaskService {
  constructor() {
    this.#connect();
  }

  /**
   * Private method used to connect to the DB.
   */
  #connect() {
    mongoose.connect(MONGO_DB_URI);
  }

  /**
   * Method that returns all tasks for a giving user ID.
   * Only authenticated users with a valid token can access this method.
   * 
   * The method will be exported via SDK using genezio.
   * 
   * @param {*} token The user's token.
   * @param {*} userId The user ID.
   * @returns An object containing two properties: { success: true, tasks: tasks }
   */
  async getAllTasksByUser(token: string, userId: string): Promise<GetTasksResponse> {
    console.log(`Get all tasks by user request received with userID ${userId}`)

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

  /**
   * Method that creates a task for a giving user ID.
   * Only authenticated users with a valid token can access this method.
   * 
   * The method will be exported via SDK using genezio.
   * 
   * @param {*} token The user's token.
   * @param {*} title The tasktitle.
   * @param {*} ownerId The owner's of the task ID.
   * @returns An object containing two properties: { success: true, tasks: tasks }
   */
  async createTask(token: string, title: string, ownerId: string): Promise<GetTaskResponse> {
    console.log(`Create task request received for user with id ${ownerId} with title ${title}`)

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

  /**
   * Method that creates a task for a giving user ID.
   * Only authenticated users with a valid token can access this method.
   * 
   * The method will be exported via SDK using genezio.
   * 
   * @param {*} token The user's token.
   * @param {*} id The task's id.
   * @param {*} title The task's title.
   * @param {*} solved If the task is solved or not.
   * @returns An object containing two properties: { success: true }
   */
  async updateTask(token: string, id: string, title: string, solved: boolean): Promise<UpdateTaskResponse> {
    console.log(`Update task request received with id ${id} with title ${title} and solved value ${solved}`)

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

  /**
   * Method that deletes a task for a giving user ID.
   * Only authenticated users with a valid token can access this method.
   * 
   * The method will be exported via SDK using genezio.
   * 
   * @param {*} token The user's token.
   * @param {*} title The tasktitle.
   * @returns An object containing one property: { success: true }
   */
  async deleteTask(token: string, id: string): Promise<DeleteTaskResponse> {
    console.log(`Delete task with id ${id} request received`)

    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    await TaskModel.deleteOne({ _id: id });

    return { success: true };
  }
}
