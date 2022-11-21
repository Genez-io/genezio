# Blockchain example

In this example, we have implemented a class that queries periodically using BlastAPI smart contract events and saves them in a MongoDB.

The class is implemented in the `blockchainServer.js` file.

Run `npm install` in both `backend/` and `frontend/` folders.

## Run the example locally

1. Run `genezio local`. This will start a local web server that listens for requests.
2. Open a new terminal and run the React app in the `frontend/` folder.

## Deploy the example in the Genezio infrastructure

1. From the `backend/` folder run `genezio deploy`. This will deploy the code to Genezio infrastructure and it will create the SDK.
2. Open a new terminal and run the React app in the `frontend/` folder.
