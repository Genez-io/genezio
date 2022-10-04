import fetch from 'node-fetch';

export class MyClass {
    async test() {
        const response = await fetch('https://api.github.com/users/github');
        const data = await response.json();
    
        console.log(data);

        console.log("My test function");
        return "My test function!";
    }

    testWithArgs(arg) {
        this.#myPrivateTest()
        console.log("My test with args", arg)
        return "My test function with args " + arg + "!"
    }

    testWithMultipleArgs(test1, test2) {
        return "My test function with args " + test1 + " " + test2 + "!"
    }

    #myPrivateTest() {
        console.log("My private function");
    }
}
