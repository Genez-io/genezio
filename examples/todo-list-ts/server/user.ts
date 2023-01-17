import mongoose from "mongoose"
import jwt from "jsonwebtoken"
import { UserModel } from "./models/user"
import { ActiveSession } from "./models/activeSession"
import { MONGO_DB_URI, saltedPassword, validatePassword } from "./helper"

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

/**
 * The User server class that will be deployed on the genezio infrastructure.
 */
export class UserService {
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
   * Method that can be used to create a new user.
   * 
   * The method will be exported via SDK using genezio.
   * 
   * @param {*} name The user's name.
   * @param {*} email The user's email.
   * @param {*} password The user's password.
   * @returns An object containing a boolean property "success" which
   * is true if the creation was successfull, false otherwise.
   */
  async register(name: string, email: string, password: string): Promise<CreateUserResponse> {
    console.log(`Registering user with name ${name} and email ${email}...`)

    const user = await UserModel.findOne({ email: email })
    if (user) {
      return { success: false, msg: "User already exists" }
    } else {
      const result = await saltedPassword(password)
      await UserModel.create({
        name: name,
        email: email,
        password: result
      });

      return { success: true }
    }
  }

  /**
   * Method that can be used to obtain a login token for a giving user.
   * 
   * The method will be exported via SDK using genezio.
   * 
   * @param {*} email The user's email.
   * @param {*} password The user's password.
   * @returns 
   */
  async login(email: string, password: string): Promise<UserLoginResponse> {
    console.log(`Login request received for user with email ${email}`)

    const user = await UserModel.findOne({ email: email });

    if (!user) {
      return { success: false, msg: "User not found" };
    }

    const isValid = await validatePassword(user.password!, password)

    if (isValid) {
      user.password = undefined;
      const token = jwt.sign(user.toJSON(), "secret", {
        expiresIn: 86400 // 1 week
      });

      await ActiveSession.create({ token: token, userId: user._id });
      return { success: true, user: {
        _id: user._id.toString(),
        name: user.name!,
        email: user.email!,
      }, token: token }
    } else {
      return { success: false, msg: "Incorrect user or password" }
    }
  }

  /**
   * Methods that receives a token and confirms if it is valid or not.
   * 
   * @param {*} token The user's token.
   * @returns An object containing a boolean property "success" which is true if the token is valid, false otherwise.
   */
  async checkSession(token: string): Promise<CheckSessionResponse> {
    console.log("Check session request received...")

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
