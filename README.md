<div align="center"> <a href="https://deployapps.dev/">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/genez-io/graphics/raw/HEAD/svg/Logo_Genezio_White.svg">
  <source media="(prefers-color-scheme: light)" srcset="https://github.com/genez-io/graphics/raw/HEAD/svg/Logo_Genezio_Black.svg">
  <img alt="genezio logo" src="https://github.com/genez-io/graphics/raw/HEAD/svg/Logo_Genezio_Black.svg">
</picture>

</div>

<br>

<div align="center">
<h2>Deploy on the fastest full-stack cloud</h2>
<h3>Check out a <u><a href="https://awesome-purple-capybara.app.genez.io/">live demo deployed with DeployApps here</a></u> </h3>
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

# What is [DeployApps](https://deployapps.dev)?

[DeployApps](https://deployapps.dev/) is a developer platform for full-stack developers or teams who need to build, run and maintain web, mobile or enterprise apps with a typesafe backend that scales automatically.

For more details on how to use `DeployApps`, you can check out the official [documentation](https://deployapps.dev/docs).

<div align="center">
<h3> :star: If you want to support the DeployApps community, give us a star on this repo :star: </h3>
</div>

# Contents

-   [Features](#features)
-   [Getting Started](#getting-started)
-   [Installation](#installation)
-   [Create a new project](#create-a-new-project)
-   [Test your project using the Test Interface](#test-your-project-using-the-test-interface)
-   [Commands Summary](#commands-summary)
-   [Examples deployed with DeployApps](#examples-deployed-with-genezio)
-   [Official documentation](#official-documentation)
    -   [How does DeployApps work?](#how-does-`genezio`-work?)
    -   [Detailed documentation](#detailed-documentation)
-   [Getting support](#getting-support)
-   [System requirements](#system-requirements)
-   [Troubleshooting](#troubleshooting)
-   [Contributing](#contributing)
-   [Ecosystem](#ecosystem)
-   [Tutorials](#tutorials)
-   [Badge](#badge)
-   [License](#license)

# Features

-   🚀 **Function-as-a-service**: No need to worry about infrastructure, scaling, or maintenance.
-   📦 **DeployApps Functions**: Deploy and run code on-demand without managing servers or infrastructure.
-   🚀 **Programming Languages**: Tested and production ready for Javascript/Typescript and Python.
-   🌐 **Framework agnostic**: works with React, Vue, Angular, Flutter, Svelte, Next, Nuxt, Nest.
-   🎯 **Seamless Bundling and Compiling**: automatically bundles and compiles your code, including dependencies, for efficient and error-free deployment.
-   ⚡  **Deploy with one command** the backend and the frontend.
-   🧩 **Typesafe RPC**: Ensuring type safety and IDE auto-completion across diverse languages like TypeScript, Flutter (Dart), Kotlin and Go, by leveraging advanced code analysis.
-   📦 **NPM Registry**: the client SDK is pushed to a private or public registry.
-   🔄 **Multiple staging environments** supported as well as local development environment.
-   🖥️ **Dashboard**: explore logs, env variables for different environments, [Test interface](https://github.com/Genez-io/genezio?tab=readme-ov-file#test-your-project-using-the-test-interface) and easy to access third party integration.
-   👥 **Collaboration**: work alone or as a team - share the projects and dashboard features between team members with different access rights.
-   ➰ **Queues**: use them for your automation apps.
-   🗄 **Databases**: provisioned by us or you can bring your own. The database is not exposed to the frontend directly. Table creation and CRUD boilerplate functions generated through LLM.
-   🕒 **Cron jobs**: scheduled to be executed up to a minute granularity.

# Getting Started

Check out our [Getting started](https://deployapps.dev/docs/getting-started) documentation page to find out how to start using DeployApps.

For more details about the `DeployApps` CLI commands, run `genezio help` or `genezio [command] help`.

# Installation

To install the `DeployApps` CLI tool, run the following command:

```bash
npm install -g genezio
```

# Create a new project

Visit the [DeployApps template page](https://app.genez.io/new-project) and create a new project. You can choose from a variety of templates or start from scratch.

If you want to create a new project from scratch, you can run the following command:

```bash
genezio create
```

If you already have a project you can either [import it from you GitHub repository](https://app.genez.io/import) or deploy it from your local machine using the following command:

```bash
genezio deploy
```

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

The DeployApps CLI tool supports the commands shown in the following table:

| Command                                   | Description                                                                                                                                                                               |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| genezio create                            | Create a new fullstack project from templates [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/genezio-create)                                                                 |
| genezio local --port `<port>`             | Runs a local environment with your project for testing purposes. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/local)                                                       |
| genezio deploy                            | Deploys your project to the DeployApps infrastructure. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/deploy)                                                                   |
| genezio list `[<identifier>]`             | Displays details of your projects. You can view them all at once or display a particular one by providing its name or ID. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/ls) |
| genezio delete `[<project-id>]`           | Deletes the project described by the provided ID. If no ID is provided, lists all the projects and IDs. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/delete)               |
| genezio sdk                               | Generates an SDK corresponding to a deployed project. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/generatesdk)                                                            |
| genezio account                           | Display information about the current account logged in. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/account)                                                             |
| genezio login `<access-token>`            | Authenticates with DeployApps platform to deploy your code. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/login)                                                               |
| genezio logout                            | Logout from DeployApps platform. [Learn more](https://deployapps.dev/docs/cli-tool/cli-commands/logout)                                                                                         |
| genezio help / genezio `<command>` --help | Displays help for the CLI tool.                                                                                                                                                           |

# Examples deployed with DeployApps

You can find out more about `DeployApps` from our [examples repository](https://github.com/Genez-io/genezio-examples).

# Official documentation

## How does DeployApps work?

`DeployApps` is using JSON RPC 2.0 to facilitate the communication between SDK and your class. Your functions are deployed in the DeployApps infrastructure. The functions are not executed on a long lasting Virtual Machine. Instead, our system uses a serverless approach. Whenever a request is received, your code is loaded and executed. This is more cost and energy efficient. However, the developer needs to take into account the following - the values of the global variables are not persistent between runs.

Type safety is ensured by the generated SDK, even if the server and the client are not written in the same language. The CLI tool analyzes the server code generates client side types equivalent to the server side types, as well as functions with equivalent signatures.

## Detailed documentation

To find more details on how to use `DeployApps`, check out the official [documentation](https://deployapps.dev/docs):

-   [Getting started](https://deployapps.dev/docs/getting-started)
-   [Project Structure](https://deployapps.dev/docs/project-structure)
-   [CLI commands](https://deployapps.dev/docs/cli-tool)
-   [Test Interface](https://deployapps.dev/docs/test-interface)
-   [Integrations](https://deployapps.dev/docs/integrations)

If you cannot find what you are looking for in the docs, don't hesitate to drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues) or [start a discussion on Discord](https://discord.gg/uc9H5YKjXv).

# Getting support

We want you to get your project up and running in no-time.

If you find yourself in a pickle using `DeployApps`, drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues), [start a discussion with us on Discord](https://discord.gg/uc9H5YKjXv) or drop us an email at [contact@genezio.io](contact@genezio.io).

# System requirements

-   `DeployApps` can be installed and used on macOS, Linux-based distributions and Windows.
-   A version of `node` >= 18 should be installed on your machine.

# Troubleshooting

For the most common issues that our users have dealt with, we created a [Troubleshooting](https://deployapps.dev/docs/troubleshooting) section in the documentation.

If you don't find the guidance there, drop us a [GitHub issue](https://github.com/Genez-io/genezio/issues). We are more than happy to help you!

# Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for more details.

Show your support by giving us a star :star:, to help others discover `DeployApps` and become part of our community!

# Ecosystem

There are a growing number of awesome projects deployed with `DeployApps` and we want to shout out about them.

If you deployed a project using `DeployApps` let us know on [Discord](https://discord.gg/uc9H5YKjXv).

# Tutorials

Check out [tutorials for building and deploying](https://deployapps.dev/tags/tutorials/) various use cases with DeployApps.

# Badge

Brag to your friends that you are using `DeployApps` with this awesome badge -> [![deployed with: DeployApps](https://img.shields.io/badge/deployed_with-genezio-6742c1.svg?labelColor=62C353&style=flat)](https://github.com/genez-io/genezio)

```md
[![deployed with: DeployApps](https://img.shields.io/badge/deployed_with-genezio-6742c1.svg?labelColor=62C353&style=flat)](https://github.com/genez-io/genezio)
```

# License

`DeployApps` is licensed under `GNU General Public License v3.0`. For more information, please refer to [LICENSE](LICENSE).
