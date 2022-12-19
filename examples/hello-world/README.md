# Hello World example

In this example, we have a class with two functions that return a welcome message.

The class is implemented in the `./server/hello.js` file.

To deploy and test it run `genezio deploy`. Once the command was successfully executed you can run `node ./client/test-hello-sdk.js`.

## Run the example locally

1. Run `genezio local` in the `server/` folder. This will generate the SDK and start a local web server that listens for requests.
2. Open a new terminal and run `node ./client/test-hello-sdk.js`. This script will use the SDK to call the methods that you have deployed locally in the previous step.
3. You should see the greeting messages.

## Deploy the example in the Genezio infrastructure

1. Run `genezio deploy` in the `server/` folder. This will deploy the code to Genezio infrastructure and it will create the SDK.
2. Run `node ./client/test-hello-sdk.js`. Now the script will use the SDK to call the methods that you have previously deployed in the Genezio infrastructure.
3. You should see the greeting messages.
