import { Env, Remote } from "./remote.js"

export class MyClass {
    static remote = new Remote(null)

    static async test() {
        return MyClass.remote.call("MyClass.test")  
    }
    
    static async testWithArgs(arg) {
        return MyClass.remote.call("MyClass.testWithArgs", arg)  
    }

    static async testWithMultipleArgs(test1, test2) {
        return MyClass.remote.call("MyClass.testWithMultipleArgs", test1, test2)  
    }

    
}

export { Env, Remote };
