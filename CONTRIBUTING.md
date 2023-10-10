# Welcome to `genezio` contributing guide

First of all, welcome to `genezio` and thank you for investing your time in contributing to our project!

In this guide you will get an overview of the contribution workflow from opening an issue, creating a PR and merging the PR.

## New contributor guide

To get an overview of the project, read the [README](README.md). Here are some resources to help you get started with open source contributions:

- [Finding ways to contribute to open source on GitHub](https://docs.github.com/en/get-started/exploring-projects-on-github/finding-ways-to-contribute-to-open-source-on-github)
- [Set up Git](https://docs.github.com/en/get-started/quickstart/set-up-git)
- [GitHub flow](https://docs.github.com/en/get-started/quickstart/github-flow)
- [Collaborating with pull requests](https://docs.github.com/en/github/collaborating-with-pull-requests)

## Getting started

### Issues

#### Create a new issue

If you spot a problem with the docs, [search if an issue already exists](https://docs.github.com/en/github/searching-for-information-on-github/searching-on-github/searching-issues-and-pull-requests#search-by-the-title-body-or-comments). If a related issue doesn't exist, you can open a new issue](https://github.com/Genez-io/genezio/issues/new).

#### Solve an issue

Scan through our [existing issues](https://github.com/Genez-io/genezio/issues) to find one that interests you. You can narrow down the search using `labels` as filters.

#### Genezio setup
To test your solution on your machine to an existing issue you need to set up genezio.
Follow the steps below:

Fork this repository and clone it on your machine.

To run the steps below, you should have [npm and node](https://nodejs.org/en/download) installed on your machine. 
Tip: You can check out [`nvm`](https://github.com/nvm-sh/nvm#installing-and-updating) to manage node installations.

Clone the forked repository on your machine:
```bash
git clone <forked_repository>
cd genezio
```

Checkout into our dev branch for the latest features:
```bash
git remote add upstream https://github.com/genez-io/genezio
git fetch upstream
git checkout -b dev upstream/dev
```

Install genezio and its dependencies:
```bash
npm install
npm run install-locally-dev
genezio login
genezio --help
```

Each time you modify the genezio codebase, rerun `npm run install-locally-dev` to build the latest source code.

### Pull Request

When you're finished with the changes, create a pull request, also known as a PR.

- Add a relevant description to your PR describing what changes have you made.
- Don't forget to [link PR to issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue) if you are solving one.
- Enable the checkbox to [allow maintainer edits](https://docs.github.com/en/github/collaborating-with-issues-and-pull-requests/allowing-changes-to-a-pull-request-branch-created-from-a-fork) so the branch can be updated for a merge.
- Once you submit your PR, a team member will review your proposal. We may ask questions or request additional information.
- We may ask for changes to be made before a PR can be merged using suggestions or pull request comments. You can apply suggested changes directly through the UI. You can make any other changes in your fork, then commit them to your branch.
- As you update your PR and apply changes, mark each conversation as resolved.
- If you run into any merge issues, checkout this [git tutorial](https://github.com/skills/resolve-merge-conflicts) to help you resolve merge conflicts and other issues.

### Your PR is merged!

Congratulations :tada::tada: The genezio team thanks you :sparkles:.

Once your PR is merged, your contributions will be publicly visible on the repository.
