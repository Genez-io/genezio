<div align="center"> <a href="https://genez.io/">
    <img
      src="https://github.com/genez-io/graphics/raw/HEAD/Logo_Genezio_Black.svg"
      width="650"
      height="auto"
    />
  </a>
</div>

# What is [genezio](https://genez.io)?

[genezio](https://genez.io/) is a platform for developers to write, deploy and use a serverless API.

You just write your backend logic in classes using your preferred programming language then call `genezio deploy`.
The code will be deployed in a scalable and production-ready infrastructure.
An SDK is generated and you can use it to remotely call the methods of your class in a very natural way.

For more details on how to use `genezio`, you can check out the official [documentation](https://genez.io/docs).

# Contents

- [Getting Started](#getting-started)
- [Create Your First Project From Scratch](#create-your-first-project-from-scratch)
- [Test Your Code Locally](#test-your-code-locally)
- [Debug Using the Test Interface](#debug-using-the-test-interface)
- [Examples deployed with genezio](#examples)
- [How does genezio work?](#how-does-genezio-work-)
- [Official Documentation](#documentation)
- [Support](#support)
- [Troubleshooting](#troubleshooting)
- [Ecosystem](#ecosystem)
- [Hall Of Fame](#hall-of-fame)
- [Badge](#badge)
- [Known issues](#known-issues)

# Getting Started

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

6. **Test the code.** Change the folder to `./genezio-examples/javascript/hello-world/client/` and run this command to test the code:

```bash
node ./test-hello-sdk.js
```

For more details about the `genezio` CLI command, run `genezio help`.

# Create Your First Project From Scratch

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

5. For more details, check our [examples](https://github.com/Genez-io/genezio/tree/master/examples)!

# Debug Using the Test Interface

# Test Your Code Locally

You can also test your code locally by running the `genezio local` command. This will spawn a local server that can be used for testing. You can switch back to production environment by running `genezio deploy`.

# Examples

You can find out more about `genezio` from our [examples repository](https://github.com/Genez-io/genezio-examples).

A detailed list of all the examples is below:

- Javascript

  - [Getting Starting](https://github.com/Genez-io/genezio-examples/tree/master/javascript/getting-started) - an example for brand new users of `genezio`.
  - [Chat-GPT Reprashing App](https://github.com/Genez-io/genezio-examples/tree/master/javascript/chatgpt-project) - an example on how to integrate with ChatGPT API.
  - [Smart Contract Indexer with Blast API](https://github.com/Genez-io/genezio-examples/tree/master/javascript/blockchain) - a Web3 example that queries smart contracts events periodically and saves them in a MongoDB using Blast API.
  - [Stripe example](https://github.com/Genez-io/genezio-examples/tree/master/javascript/stripe-js) - an example on how to integrate with Stripe for managing payments.
  - [Todo List with React and MongoDB](https://github.com/Genez-io/genezio-examples/tree/master/javascript/todo-list) - an example of a todo application with users, auth and tasks.
  - [Todo List with React and SQL](https://github.com/Genez-io/genezio-examples/tree/master/javascript/todo-list-sql) - an example of a todo application with users, auth and tasks.
  - [Todo List with Vue and MongoDB](https://github.com/Genez-io/genezio-examples/tree/master/javascript/todo-list-vue) - an example of a todo application with users, auth and tasks.
  - [Webhooks](https://github.com/Genez-io/genezio-examples/tree/master/javascript/webhook) - an example on how to use webhooks with genezio.
  - [Crons](https://github.com/Genez-io/genezio-examples/tree/master/javascript/cron) - a simple class that has a method that will be called every minute.

- Typescript
  - [Todo List with React and MongoDB](https://github.com/Genez-io/genezio-examples/tree/master/typescript/todo-list) - an example of a todo application with users, auth and tasks.
  - [Todo List with Angular and MongoDB](https://github.com/Genez-io/genezio-examples/tree/master/typescript/todo-list-angular) - an example of a todo application with users.
  - [MultiversX](https://github.com/Genez-io/genezio-examples/tree/master/typescript/multiversx) - an example on an integration with the MultiversX blockchain. The application queries the balance of an existing account.

<!-- # Features -->

# How does Genezio work?

Genezio is using JSON RPC 2.0 to facilitate the communication between SDK and your class. Your functions are deployed in the Genezio infrastructure. The functions are not executed on a long lasting Virtual Machine. Instead, our system uses a serverless approach. Whenever a request is received, your code is loaded and executed. This is more cost and energy efficient. However, the developer needs to take into account the following - the values of the global variables are not persistent between runs.

# Documentation

To find more details on how to use genezio, check out our [Documentation](https://genez.io/docs):

- [Getting started](https://docs.genez.io/genezio-documentation/getting-started)
- [Project Structure](https://docs.genez.io/genezio-documentation/project-structure)
- [CLI commands](https://docs.genez.io/genezio-documentation/cli-tool)
- [Test Interface](https://docs.genez.io/genezio-documentation/test-interface)
- [Integrations](https://docs.genez.io/genezio-documentation/integrations)

If you cannot find what you are looking for in the docs, don't hesitate to drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues) or [start a discussion on Discord](https://discord.gg/uc9H5YKjXv).

# Support

We want you to get your project up and running in no-time.
If you find yourself in a pickle using genezio, [start a discussion with us on Discord](https://discord.gg/uc9H5YKjXv) or drop us an email at [contact@genezio.io](contact@genezio.io).

# Troubleshooting

For the most common issues that our users have dealt with, we created a [Troubleshooting](https://docs.genez.io/genezio-documentation/troubleshooting) section.

If you don't find the guidance there, drop us a [Github issue](https://github.com/Genez-io/genezio/issues). We are more than happy to help you!

# Ecosystem

There are a growing number of awesome projects deployed with `genezio` and we want to shout out about them.

If you deployed a project using `genezio` let us know on [Discord](https://discord.gg/uc9H5YKjXv) and we will add it to our [Hall Of Fame](https://github.com/Genez-io/genezio#hall-of-fame).

# Hall Of Fame

Below you can find projects build by the community and deployed with `genezio`.

Check them out for inspiration:

If you've also built a project that you are proud of, let us know by [on Discord](https://discord.gg/uc9H5YKjXv).

# Badge

Brag to your friends that you are using `genezio` with this awesome badge [![deployed with: genezio](https://img.shields.io/badge/deployed_with-genezio-6742c1.svg?labelColor=62C353&style=flat-square)](https://github.com/genez-io/genezio)

<!-- # Contributing -->

<!-- # License -->

# Known issues

- `genezio` currently has full support for JavaScript. TypeScript is deployed in a beta version. We will soon offer full support for TypeScript, Swift, Kotlin and many others.
- `genezio` currently is able to generate an SDK in JavaScript (full), TypeScript (beta) and Swift (beta).
- The execution time of the functions cannot exceed 10 seconds. This limitation will go away soon.
