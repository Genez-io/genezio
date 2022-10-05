const mongoose = require("mongoose");
const reqAuth = require("./helper").reqAuth;
const TaskModel = require("./models/task");
require("dotenv").config();

export class Task {
  constructor() {
    this.connect();
  }

  // connect mongoose to mongodb
  connect() {
    mongoose.connect(process.env.MONGO_DB_URI);
  }

  // get all tasks of a user
  async getAllByUser(token, userId) {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const tasks = await TaskModel.find({ ownerId: userId });
    return { success: true, tasks: tasks };
  }

  // create a new task
  async createTask(token, title, ownerId) {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    await TaskModel.create({
      title: title,
      ownerId: ownerId
    });

    return { success: true, task: { title: title, ownerId: ownerId } };
  }

  // update a task
  async updateTask(token, id, title, solved) {
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
  async deleteTask(token, id) {
    const authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    await TaskModel.deleteOne({ _id: id });

    return { success: true };
  }
}
