# genezio

[genezio](https://genez.io/) is a platform for developers that want to write a backend in a very simple way. Just write a simple class using your preferred programming language then call `genezio deploy`. The code will be deployed in a scalable and production-ready infrastructure. An SDK is generated for you and you can use it to remotely call the methods of your class in a very natural way.

For more details about the `genezio` CLI tool, you can check out the official [documentation](https://docs.genezio).

## Getting started

1. **Install `genezio`.** Use the command below to install genezio:

```bash
npm install genezio -g
```

2. **Login to `genezio`.** Run the following command to login into your account:

```bash
genezio login
```

3. **Clone our `Hello World` example.** Copy the following command in your terminal:

```bash
git clone https://github.com/Genez-io/genezio-examples.git
```

4. **Navigate to the project folder.** Copy the following command in your terminal to go to the "Hello World" project folder:

```bash
cd ./genezio-examples/javascript/hello-world/server/
```

5. **Deploy your code.** Use the command below to deploy the code using genezio:

```bash
genezio deploy
```

6. **Test the code.**  Change the folder to `./genezio-examples/javascript/hello-world/client/` and run this command to test the code:

```bash
node ./test-hello-sdk.js
```

For more details about the `genezio` CLI command, run `genezio help`.

## Create your first project from scratch

1. Run `genezio login`.

2. Run `genezio init` and answer the following questions:

```
What is the name of the project: hello-world
In what programming language do you want your SDK? (js or ts) [default value: js]: js
What runtime will you use? Options: "node" or "browser". [default value: node]: node
Where do you want to save your SDK? [default value: ./sdk/]: ./sdk/
```

A configuration file `genezio.yaml` will be generated.

3. Run `genezio addClass hello.js` and open the newly created file and write the following class:

```javascript
export class HelloWorldClass {
  helloWorld() {
    return "Hello world!";
  }

  hello(name, location) {
    return `Hello, ${name}! Greetings from ${location}!`;
  }
}
```

4. Run `genezio deploy` to deploy your code. An SDK is generated for you in the `./sdk/` path. You can now call your hello world methods remotely.

```javascript
import { HelloWorldClass } from "./sdk/hello.sdk.js";

(async () => {
  console.log(await HelloWorldClass.helloWorld());
  console.log(await HelloWorldClass.hello("George", "Tenerife"));
})();
```

For more details, check our [examples](https://github.com/Genez-io/genezio/tree/master/examples)!

## Test your code locally

You can also test your code locally by running the `genezio local` command. This will spawn a local server that can be used for testing. You can switch back to production environment by running `genezio deploy`.

## Troubleshooting

- If you see the following error `SyntaxError: Cannot use import statement outside a module` add `"type": "module"` in package.json.

## Known issues

- `genezio` currently has full support for JavaScript. TypeScript is deployed in a beta version. We will soon offer full support for TypeScript, Swift, Kotlin and many others.
- `genezio` currently is able to generate an SDK in JavaScript (full), TypeScript (beta) and Swift (beta).
- The execution time of the functions cannot exceed 10 seconds. This limitation will go away soon.

## How does Genezio work?

Genezio is using JSON RPC 2.0 to facilitate the communication between SDK and your class. Your functions are deployed in the Genezio infrastructure. The functions are not executed on a long lasting Virtual Machine. Instead, our system uses a serverless approach. Whenever a request is received, your code is loaded and executed. This is more cost and energy efficient. However, the developer needs to take into account the following - the values of the global variables are not persistent between runs.

## Learn more about genezio using other examples:

- [To do app](https://github.com/Genez-io/genezio/tree/master/examples/todo-list) - an example of a todo application with users, auth and tasks that uses React for the frontend application and Genezio for deploying and developing the backend.
- [Crons](https://github.com/Genez-io/genezio/tree/master/examples/cron) - a simple class that has a method that will be called every minute.
- [Blockchain](https://github.com/Genez-io/genezio/tree/master/examples/blockchain) - implement a class that queries periodically using BlastAPI smart contract events and saves them in a MongoDB.
