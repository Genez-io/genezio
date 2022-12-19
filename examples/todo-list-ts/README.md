# Todo App example

This is an example of a todo application with users, auth and tasks that uses React for the frontend application and Genezio for deploying and developing the backend.

## Initialization

1. Run `npm install` in the `server/` folder to install the dependencies.
2. Run `npm install` in the `client/` folder to install the dependencies.

## Run the example locally

1. Run `genezio local` in the `server/` folder to start the local server.
2. Start the React app by going to the `client/` folder and run `npm start`.

## Deploy the example in the Genezio infrastructure

1. Run `genezio deploy` in the `server/` folder that contains also the `genezio.yaml` file. This will deploy your code in the Genezio infrastructure and it will also create an SDK that can be used to call the methods remotely.
2. Start the React app by going to the `client/` folder and run `npm start`.
