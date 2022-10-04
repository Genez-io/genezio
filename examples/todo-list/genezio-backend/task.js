const mongoose = require("mongoose");
const reqAuth = require("./helper").reqAuth;
const TaskModel = require("./models/task");

export class Task {
  constructor() {
    this.connect();
  }

  // connect mongoose to mongodb
  connect() {
    mongoose.connect("mongodb://localhost:27017/genezio-todo-app");
  }

  // get all tasks of a user
  async getAllByUser(userId) {
    authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const promise = new Promise((resolve, reject) => {
      TaskModel.find({ ownerId: userId }, function (err, tasks) {
        resolve(tasks);
      });
    });

    return promise;
  }

  // create a new task
  async create(title, ownerId) {
    authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const promise = new Promise((resolve, reject) => {
      TaskModel.create({
        title: title,
        ownerId: ownerId
      });

      resolve({ success: true });
    });

    return promise;
  }

  // update a task
  async update(id, title, solved) {
    authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const promise = new Promise((resolve, reject) => {
      TaskModel.updateOne(
        { _id: id },
        {
          title: title,
          solved: solved
        }
      );

      resolve({ success: true });
    });

    return promise;
  }

  // delete a task
  async delete(id) {
    authObject = await reqAuth(token);
    if (!authObject.success) {
      return authObject;
    }
    const promise = new Promise((resolve, reject) => {
      TaskModel.deleteOne({ _id: id });

      resolve({ success: true });
    });

    return promise;
  }
}
