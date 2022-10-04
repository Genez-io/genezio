# Genezio

Genezio is a platform for developers that want to write a backend in a very simple way. Just write a simple class using your preferred programming language then call `genezio deploy`. An SDK will be generated for you that you can use to call the methods of the class in a very natural way.

## Install `genezio`

To install `genezio` locally run:
```bash
npm run install-locally
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

4. Run `genezio deploy`. An SDK is generated for you in the `./sdk/` path. You can now call your hello world methods remotely.

```javascript
import { HelloWorldClass } from "./sdk/hello.sdk.js"

(async () => {
    console.log(await HelloWorldClass.helloWorld())
    console.log(await HelloWorldClass.hello("George", "Tenerife"))
})();
```

Check out the `./examples/` folder for more examples.

## Knwown issues

* Genezio currently support only Javascript. We plan to add support for more languages soon.
* You can use other node dependencies. However, we currently have a problem with the binary dependecies. If you encounter any issues, contact us.

## How does it work?

Genezio is using JSON RPC 2.0 to facilitate the communication between SDK and your class. Your functions are deployed in Genezio infrastructure.
