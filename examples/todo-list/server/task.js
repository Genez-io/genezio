import { mongoose } from "mongoose"
import { reqAuth, MONGO_DB_URI } from "./helper"
import { TaskModel } from "./models/task"


/**
 * The Task server class that will be deployed on the genezio infrastructure.
 */
export class Task {
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
  async getAllTasksByUser(token, userId) {
    console.log(`Get all tasks by user request received with userID ${userId}`)

    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const tasks = await TaskModel.find({ ownerId: userId });
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
  async createTask(token, title, ownerId) {
    console.log(`Create task request received for user with id ${ownerId} with title ${title}`)

    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const task = await TaskModel.create({
      title: title,
      ownerId: ownerId
    });

    return {
      success: true,
      task: { title: title, ownerId: ownerId, _id: task._id.toString() }
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
  async updateTask(token, id, title, solved) {
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
   * @param {*} ownerId The owner's of the task ID.
   * @returns An object containing one property: { success: true }
   */
  async deleteTask(token, id) {
    console.log(`Delete task with id ${id} request received`)

    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    await TaskModel.deleteOne({ _id: id });

    return { success: true };
  }
}
