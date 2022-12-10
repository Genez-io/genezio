import mongoose from "mongoose"
import bcrypt from "bcryptjs"
import jwt from "jsonwebtoken"
import { UserModel } from "./models/user"
import { ActiveSession } from "./models/activeSession"
import { MONGO_DB_URI } from "./helper"

export type CreateUserResponse = {
  success: boolean,
  msg?: string
}

export type User = {
  _id: string,
  name: string,
  email: string,
}

export type UserLoginResponse = {
  success: boolean,
  user?: User,
  token?: string,
  msg?: string,
}

export type CheckSessionResponse = {
  success: boolean,
}

export class UserService {
  constructor() {
    this.connect();
  }

  // connect mongoose to mongodb
  connect() {
    mongoose.connect(MONGO_DB_URI);
  }

  // create a new user
  async create(name: string, email: string, password: string): Promise<CreateUserResponse> {
    const promise = new Promise<CreateUserResponse>((resolve) => {
      UserModel.findOne({ email: email }, function(err: any, user: any) {
        if (user) {
          resolve({ success: false, msg: "User already exists" });
        } else {
          bcrypt.genSalt(2, function(err: any, salt: any) {
            if (err) {
              throw err;
            }

            bcrypt.hash(password, salt, async function(err: any, hash: any) {
              if (err) {
                throw err;
              }

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
  async login(email: string, password: string): Promise<UserLoginResponse> {
    const user = await UserModel.findOne({ email: email });

    if (!user) {
      return { success: false, msg: "User not found" };
    }

    const promise = new Promise<UserLoginResponse>((resolve) => {
      bcrypt.compare(password, user.password!, async function(err: any, res: any) {
        if (err) {
          throw err
        }

        if (res) {
          user.password = undefined;
          const token = jwt.sign(user.toJSON(), "secret", {
            expiresIn: 86400 // 1 week
          });

          await ActiveSession.create({ token: token, userId: user._id });
          resolve({ success: true, user: {
            name: user.name!,
            email: user.email!,
            _id: user._id.toString()
          }, token: token });
        } else {
          resolve({ success: false, msg: "Incorrect user or password" });
        }
      });
    });

    return promise;
  }

  // register a new user
  register(name: string, email: string, password: string): Promise<CreateUserResponse> {
    return this.create(name, email, password);
  }

  // check if a session is valid
  async checkSession(token: string): Promise<CheckSessionResponse> {
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
