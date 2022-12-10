import { Remote } from "./remote.js"

export type CreateUserResponse = {
  success: boolean,
  msg?: string
};

export type User = {
  _id: string,
  name: string,
  email: string,
};

export type UserLoginResponse = {
  success: boolean,
  user?: User,
  token?: string,
  msg?: string,
};

export type CheckSessionResponse = {
  success: boolean,
};


export class UserService {
    static remote = new Remote("https://rpnwq4mjgm74cesqrzj63vo5qq0ldmza.lambda-url.us-east-1.on.aws/")

    static async connect()  {
        return UserService.remote.call("UserService.connect")
    }
      
    static async create(name: string, email: string, password: string): Promise<CreateUserResponse> {
        return UserService.remote.call("UserService.create", name, email, password)  
    }
  
    static async login(email: string, password: string): Promise<UserLoginResponse> {
        return UserService.remote.call("UserService.login", email, password)  
    }
  
    static async register(name: string, email: string, password: string): Promise<CreateUserResponse> {
        return UserService.remote.call("UserService.register", name, email, password)  
    }
  
    static async checkSession(token: string): Promise<CheckSessionResponse> {
        return UserService.remote.call("UserService.checkSession", token)  
    }
  
    
}

export { Remote };
