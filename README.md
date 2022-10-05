# Genezio

Genezio is a platform for developers that want to write a backend in a very simple way. Just write a simple class using your preferred programming language then call `genezio deploy`. The code will be deployed in a scalable and production-ready infrastructure. An SDK is generated for you and you can use it to remotely call the methods of your class in a very natural way.

## Install `genezio`

To install `genezio` run:
```bash
npm install genezio
```

For more details about the `genezio` CLI command, run `genezio help`.

## Getting started

1. Run `genezio init` and answer the following questions:

```
What is the name of the project: hello-world
In what programming language do you want your SDK? [js]: js
What runtime will you use? Options: "node" or "browser". [node]: node
Where do you want to save your SDK? [./sdk/]: ./sdk/
```

A configuration file `genezio.yaml` will be generated.

2. Create a file `hello.js` and write the following class.

```javascript
export class HelloWorldClass {
    helloWorld() {
        return "Hello world!";
    }

    hello(name, location) {
        return `Hello, ${name}! Greetings from ${location}!`
    }
}
```

3. Add `hello.js` path in the `genezio.yaml` configuration file in `classPaths`.

```yaml
name: hello-world
sdk:
  language: js
  runtime: node
  path: ./sdk/
classPaths:
  - "./hello.js"
```

4. Run `genezio login <code>` with the code for the early testing phase. If you don't have a code and you want to participate in the early testing phase contact us at contact@genez.io. After that, you can run `genezio deploy` to deploy your code. An SDK is generated for you in the `./sdk/` path. You can now call your hello world methods remotely.

```javascript
import { HelloWorldClass } from "./sdk/hello.sdk.js"

(async () => {
    console.log(await HelloWorldClass.helloWorld())
    console.log(await HelloWorldClass.hello("George", "Tenerife"))
})();
```

Check out the `./examples/` folder for more examples.

### Test your code locally

You can also test your code locally by running the `genezio local` command. This will spawn a local server that can be used for testing. To change the environment that your SDK is pointing to just run `genezio generateSdk local`. You can switch back to production environment by running `genezio generateSdk production` or `genezio deploy`.


## Troubleshooting

* If you see the following error `SyntaxError: Cannot use import statement outside a module` add `"type": "module"` in package.json.

## Knwown issues

* Genezio currently support only Javascript. We will offer support for Typescript, Swift, Kotlin and many others.
* You can use external npm dependencies. However, we currently have a problem with the binary dependecies. If you encounter any issues, contact us.
* The execution time of the functions cannot exceed 10 seconds. This limitation will go away soon.

## How does Genezio work?

Genezio is using JSON RPC 2.0 to facilitate the communication between SDK and your class. Your functions are deployed in Genezio infrastructure. The functions are not executed on a long lasting Virtual Machine. Instead our system uses a serverless approach. Whenever a request is received, your code is loaded and executed. This is more cost and energy efficient. However, the developer needs to take this into account. The values of the global variables are not persisted between runs.
