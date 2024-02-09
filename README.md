<div align="center"> <a href="https://genezio.com/">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/genez-io/graphics/raw/HEAD/svg/Logo_Genezio_White.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/genez-io/graphics/raw/HEAD/svg/Logo_Genezio_Black.svg">
  <img alt="genezio logo" src="https://github.com/genez-io/graphics/raw/HEAD/svg/Logo_Genezio_Black.svg">
</picture>

</div>

<br>

<div align="center">
<h2>The easiest way to write and host a serverless application</h2>
<h3>Check out a <u><a href="https://awesome-purple-capybara.app.genez.io/">live demo deployed with genezio here</a></u> </h3>
</div>

<br>

<div align="center">

[![unit-tests](https://github.com/Genez-io/genezio/actions/workflows/unit-test.yaml/badge.svg)](https://github.com/Genez-io/genezio/actions/workflows/unit-test.yaml)
[![windows-integration-tests-prod](https://github.com/Genez-io/genezio-tests/actions/workflows/integration-prod-windows.yml/badge.svg)](https://github.com/Genez-io/genezio-tests/actions/workflows/integration-prod-windows.yml)
[![linux-integration-tests-prod](https://github.com/Genez-io/genezio-tests/actions/workflows/integration-prod-linux.yml/badge.svg)](https://github.com/Genez-io/genezio-tests/actions/workflows/integration-prod-linux.yml)

</div>

<div align="center">

[![npm-downloads](https://img.shields.io/npm/dm/genezio.svg?style=flat&label=npm-downloads&color=62C353)](https://www.npmjs.com/package/genezio)

[![npm-version](https://img.shields.io/npm/v/genezio.svg?style=flat&label=npm-package-version&color=62C353)](https://www.npmjs.com/package/genezio)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat&color=62C353)](https://github.com/Genez-io/genezio/blob/main/CONTRIBUTING.md)

</div>

<div align="center">

[![Join our community](https://img.shields.io/discord/1024296197575422022?style=social&label=Join%20our%20community%20&logo=discord&labelColor=6A7EC2)](https://discord.gg/uc9H5YKjXv)
[![Follow @geneziodev](https://img.shields.io/twitter/url/https/twitter.com/geneziodev.svg?style=social&label=Follow%20%40geneziodev)](https://twitter.com/geneziodev)

</div>

# What is [genezio](https://genezio.com)?

[genezio](https://genezio.com/) is a developer platform for full-stack developers or teams who need to build, run and maintain web, mobile or enterprise apps with a typesafe backend that scales automatically.

For more details on how to use `genezio`, you can check out the official [documentation](https://genezio.com/docs).

<div align="center">
<h3> :star: If you want to support the genezio community, give us a star on this repo :star: </h3>
</div>

# Contents

-   [Features](#features)
-   [Getting Started](#getting-started)
-   [Test your project using the Test Interface](#test-your-project-using-the-test-interface)
-   [Commands Summary](#commands-summary)
-   [Examples deployed with genezio](#examples-deployed-with-`genezio`)
-   [Official documentation](#official-documentation)
    -   [How does genezio work?](#how-does-`genezio`-work?)
    -   [Detailed documentation](#detailed-documentation)
-   [Getting support](#getting-support)
-   [System requirements](#system-requirements)
-   [Troubleshooting](#troubleshooting)
-   [Contributing](#contributing)
-   [Ecosystem](#ecosystem)
-   [Hall Of Fame](#hall-of-fame)
-   [Badge](#badge)
-   [License](#license)

# Features

-   💡 Full static type-safety with **auto-completion** in your favorite editor.
-   🧩 **Typesafe RPC**: Ensuring type safety and IDE auto-completion across diverse languages like TypeScript, Dart, Kotlin and Go, by leveraging advanced code analysis.
-   🚀 Tested and production ready for Typescript.
    -   Beta support for: Kotlin and DART.
    -   Under development: GoLang and Swift.
-   📦 Export the resulting SDK using dependency managers such as **NPM Registry** - private to your team or public for anybody to use.
-   🌐 **Framework agnostic**: works with React, Vue, Angular, Svelte, ExpressJS, Fastify, etc.
-   🎯 **Seamless Bundling and Compiling**
-   ⚡ **Deploy with one command** the backend and the frontend.
-   🔄 **Multiple staging environments** supported as well as local development environment.
-   🖥️ **Dashboard**: explore logs, env variables for different environments, [Test interface](https://github.com/Genez-io/genezio?tab=readme-ov-file#test-your-project-using-the-test-interface) and easy to access third party integration.
-   👥 **Collaboration**: work alone or as a team - share the projects and dashboard features between team members with different access rights.
-   ➰ **Queues**: use them for your automation apps.
-   🗄 **Databases**: provisioned by us or you can bring your own. The database is not exposed to the frontend directly. Table creation and CRUD boilerplate functions generated through LLM.
-   🕒 **Cron jobs**: scheduled to be executed up to a minute granularity.

# Getting Started

Check out our [Getting started](https://genezio.com/docs/getting-started) documentation page to find out how to start using Genezio.

For more details about the `genezio` CLI commands, run `genezio help` or `genezio [command] help`.

# Test your project using the Test Interface

You can also test your code locally by running the following command in the `server` directory.

```bash
genezio local
```

This will spawn a local server that can be used for testing.
Now, you can navigate to the [Test Interface](https://app.genez.io/test-interface/local?port=8083) and test your project locally from GUI.

<div align="center">
<img src="https://github.com/Genez-io/graphics/blob/main/demo_screenshots/ss_test_interface.png" alt="Test Interface" style="height: auto; width:700px;"/>
</div>

Once you are happy with your project, you can deploy it in a production environment by running: `genezio deploy`.

# Commands Summary

The genezio CLI tool supports the commands shown in the following table:

| Command                                                           | Description                                                                                                                                                                               |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| genezio                                                           | Context aware, interactive command that simplifies project management. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/genezio)                                               |
| genezio create fullstack `<backend-template> <frontend-template>` | Create a new fullstack project based on two templates: one backend and one frontend. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/genezio-create)                          |
| genezio create backend `<template>`                               | Create a new backend project based on a template. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/genezio-create)                                                             |
| genezio create frontend `<template>`                              | Create a new frontend project based on a template. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/genezio-create)                                                            |
| genezio create templates [filter]                                 | Lists all the available starting templates. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/genezio-create)                                                                   |
| genezio addClass `<class-path> [<class-type>]`                    | Adds a new class to the 'genezio.yaml' file. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/genezio-addclass)                                                                |
| genezio generateSdk                                               | Generates an SDK corresponding to a deployed project. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/generatesdk)                                                            |
| genezio local --port `<port>`                                     | Runs a local environment with your project for testing purposes. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/local)                                                       |
| genezio deploy                                                    | Deploys your project to the genezio infrastructure. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/deploy)                                                                   |
| genezio ls `[<identifier>]`                                       | Displays details of your projects. You can view them all at once or display a particular one by providing its name or ID. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/ls) |
| genezio delete `[<project-id>]`                                   | Deletes the project described by the provided ID. If no ID is provided, lists all the projects and IDs. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/delete)               |
| genezio account                                                   | Display information about the current account logged in. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/account)                                                             |
| genezio login `<access-token>`                                    | Authenticates with genezio platform to deploy your code. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/login)                                                               |
| genezio logout                                                    | Logout from genezio platform. [Learn more](https://genezio.com/docs/cli-tool/cli-commands/logout)                                                                                         |
| genezio help / genezio `<command>` --help                         | Displays help for the CLI tool.                                                                                                                                                           |

# Examples deployed with genezio

You can find out more about `genezio` from our [examples repository](https://github.com/Genez-io/genezio-examples).

A detailed list of all the examples is below:

-   Javascript

    -   [Getting Starting](https://github.com/Genez-io/genezio-examples/tree/main/javascript/getting-started) - an example for brand new users of `genezio`.
    -   [Chat-GPT Reprashing App](https://github.com/Genez-io/genezio-examples/tree/main/javascript/chatgpt-project) - an example on how to integrate with ChatGPT API.
    -   [Smart Contract Indexer with Blast API](https://github.com/Genez-io/genezio-examples/tree/main/javascript/blockchain) - a Web3 example that queries smart contracts events periodically and saves them in a MongoDB using Blast API.
    -   [Integrate with Stripe](https://github.com/Genez-io/genezio-examples/tree/main/javascript/stripe-js) - an example on how to integrate with Stripe for managing payments.
    -   [Todo List with React and MongoDB](https://github.com/Genez-io/genezio-examples/tree/main/javascript/todo-list) - an example of a todo application with users, auth and tasks.
    -   [Todo List with React and SQL](https://github.com/Genez-io/genezio-examples/tree/main/javascript/todo-list-sql) - an example of a todo application with users, auth and tasks.
    -   [Todo List with Vue and MongoDB](https://github.com/Genez-io/genezio-examples/tree/main/javascript/todo-list-vue) - an example of a todo application with users, auth and tasks.
    -   [Webhooks](https://github.com/Genez-io/genezio-examples/tree/main/javascript/webhook) - an example on how to use webhooks with `genezio`.
    -   [Crons](https://github.com/Genez-io/genezio-examples/tree/main/javascript/cron) - a simple class that has a method that will be called every minute.

-   Typescript

    -   [Getting Started](https://github.com/Genez-io/genezio-examples/tree/main/typescript/getting-started) - an example for brand new users of `genezio`.
    -   [Todo List with React and MongoDB](https://github.com/Genez-io/genezio-examples/tree/main/typescript/todo-list) - an example of a todo application with users, auth and tasks.
    -   [Todo List with Angular and MongoDB](https://github.com/Genez-io/genezio-examples/tree/main/typescript/todo-list-angular) - an example of a todo application with users.
    -   [Todo List with Flutter and MongoDB](https://github.com/Genez-io/genezio-examples/tree/main/typescript/todo-list-angular) - an example of a todo application with users.
    -   [MultiversX](https://github.com/Genez-io/genezio-examples/tree/main/typescript/multiversx) - an example on an integration with the MultiversX blockchain. The application queries the balance of an existing account.

-   Dart
    -   [Getting Started](https://github.com/Genez-io/genezio-examples/tree/main/dart/getting-started) - an example for brand new users of `genezio`.
    -   [Todo List with React and MongoDB](https://github.com/Genez-io/genezio-examples/tree/main/dart/todo-list-react-typescript) - an example of a todo application.
    -   [Chat with Yoda with ChatGPT API](https://github.com/Genez-io/genezio-examples/tree/main/dart/chat-with-yoda-chatgpt) - an example on how to integrate with ChatGPT API.

# Official documentation

## How does genezio work?

`genezio` is using JSON RPC 2.0 to facilitate the communication between SDK and your class. Your functions are deployed in the Genezio infrastructure. The functions are not executed on a long lasting Virtual Machine. Instead, our system uses a serverless approach. Whenever a request is received, your code is loaded and executed. This is more cost and energy efficient. However, the developer needs to take into account the following - the values of the global variables are not persistent between runs.

## Detailed documentation

To find more details on how to use `genezio`, check out the official [documentation](https://genezio.com/docs):

-   [Getting started](https://genezio.com/docs/getting-started)
-   [Project Structure](https://genezio.com/docs/project-structure)
-   [CLI commands](https://genezio.com/docs/cli-tool)
-   [Test Interface](https://genezio.com/docs/test-interface)
-   [Integrations](https://genezio.com/docs/integrations)

If you cannot find what you are looking for in the docs, don't hesitate to drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues) or [start a discussion on Discord](https://discord.gg/uc9H5YKjXv).

# Getting support

We want you to get your project up and running in no-time.

If you find yourself in a pickle using `genezio`, drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues), [start a discussion with us on Discord](https://discord.gg/uc9H5YKjXv) or drop us an email at [contact@genezio.io](contact@genezio.io).

# System requirements

-   `genezio` can be installed and used on macOS, Linux-based distributions and Windows.
-   A version of `node` >= 16.0.0 should be installed on your machine.

# Troubleshooting

For the most common issues that our users have dealt with, we created a [Troubleshooting](https://genezio.com/docs/troubleshooting) section in the documentation.

If you don't find the guidance there, drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues). We are more than happy to help you!

# Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for more details.

Show your support by giving us a star :star:, to help others discover `genezio` and become part of our community!

# Ecosystem

There are a growing number of awesome projects deployed with `genezio` and we want to shout out about them.

If you deployed a project using `genezio` let us know on [Discord](https://discord.gg/uc9H5YKjXv) and we will add it to our [Hall Of Fame](https://github.com/Genez-io/genezio#hall-of-fame).

# Hall Of Fame

Below you can find projects build by the community and deployed with `genezio`.

Check them out for inspiration:

-   [Serverless Wordpress](https://github.com/andreia-oca/serverless-wordpress) - deploy your own wordpress blog on a serverless infrastructure.
-   [Ode to my Other Half](https://github.com/vladiulianbogdan/ode-to-my-other-half) - send recurrent poems to your loved one using ChatGPT and Twilio.
-   [FusionSolar Energy Optimizer](https://github.com/bogdanripa/fusionsolar-energy-optimizer) - match the energy that a Huawei FusionSolar inverter generates from solar panels to a Tesla to charge it without using more energy than generated by the solar panels.
-   [Zero-Knowledge KYC using MultiversX NFTs](https://github.com/damienen/reputation-system) - a zero-knowledge design for the usual KYC workflow using Passbase as a KYC provider.

If you've also built a project that you are proud of, please open a [Pull Request](https://github.com/Genez-io/genezio/pulls) adding it or let us know [on Discord](https://discord.gg/uc9H5YKjXv).

# Badge

Brag to your friends that you are using `genezio` with this awesome badge -> [![deployed with: genezio](https://img.shields.io/badge/deployed_with-genezio-6742c1.svg?labelColor=62C353&style=flat)](https://github.com/genez-io/genezio)

```md
[![deployed with: genezio](https://img.shields.io/badge/deployed_with-genezio-6742c1.svg?labelColor=62C353&style=flat)](https://github.com/genez-io/genezio)
```

# License

`genezio` is licensed under `GNU General Public License v3.0`. For more information, please refer to [LICENSE](LICENSE).
