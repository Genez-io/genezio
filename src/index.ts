#! /usr/bin/env node

import { Command } from 'commander'
import keytar from 'keytar'
import { deployFunctions, generateSdks, init } from './commands'
import Server from './localEnvironment'

const program = new Command();

program
  .name('genezio')
  .description('CLI to interact with the Genezio infrastructure!')
  .version('0.1.0');

program.command('init')
  .description('Initialize a Genezio project.')
  .action(async () => {
    await init()
  });

program.command('login')
  .argument('<code>', 'The authentication code.')
  .description('Authenticate with Genezio platform to deploy your code.')
  .action(async (code) => {
    await keytar.setPassword("genezio", "genezio", code);
  });

program.command('deploy')
  .description('Deploy the functions mentioned in the genezio.yaml file to Genezio infrastructure.')
  .action(async () => {
    await deployFunctions()
      .catch((error: Error) => {
        console.error(error.message);
      });
  });

program.command('generateSdk')
  .description('Generate the SDK.')
  .action(async () => {
    await generateSdks()
      .catch((error: Error) => {
        console.error(`${error}`);
      })
      .then(() => {
        console.log('Your SDK was successfully generated!')
      });
  });

program.command('local')
  .description('Run a local environment for your functions.')
  .action(async () => {
    try {
      const server = new Server()
      const handlers = await server.generateHandlersFromFiles()
      await server.start(handlers)
    } catch(error) {
      console.error(`${error}`);
    }
  });

program.parse();