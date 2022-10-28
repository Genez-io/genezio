const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const UserModel = require("./models/user");
const ActiveSession = require("./models/activeSession");
const MONGO_DB_URI = require("./helper").MONGO_DB_URI;
export class User {
  constructor() {
    this.connect();
  }

  // connect mongoose to mongodb
  connect() {
    mongoose.connect(MONGO_DB_URI);
  }

  // create a new user
  async create(name, email, password) {
    const promise = new Promise((resolve, reject) => {
      UserModel.findOne({ email: email }, function(err, user) {
        if (user) {
          resolve({ success: false, msg: "User already exists" });
        } else {
          bcrypt.genSalt(2, function(err, salt) {
            bcrypt.hash(password, salt, async function(err, hash) {
              await UserModel.create({
                name: name,
                email: email,
                password: hash
              });

              resolve({ success: true });
            });
          });
        }
      });
    });

    return promise;
  }

  // login
  async login(email, password) {
    const user = await UserModel.findOne({ email: email });

    if (!user) {
      return { success: false, msg: "User not found" };
    }

    const promise = new Promise((resolve, reject) => {
      bcrypt.compare(password, user.password, async function(err, res) {
        if (res) {
          user.password = null;
          const token = jwt.sign(user.toJSON(), "secret", {
            expiresIn: 86400 // 1 week
          });

          await ActiveSession.create({ token: token, userId: user._id });
          resolve({ success: true, user: user, token: token });
        } else {
          resolve({ success: false, msg: "Incorrect user or password" });
        }
      });
    });

    return promise;
  }

  // register a new user
  register(name, email, password) {
    return this.create(name, email, password);
  }

  // check if a session is valid
  async checkSession(token) {
    const activeSession = await ActiveSession.findOne({ token: token });
    if (!activeSession) {
      return { success: false };
    }

    const user = await UserModel.findById(activeSession.userId);
    if (!user) {
      return { success: false };
    }

    return { success: true };
  }
}
