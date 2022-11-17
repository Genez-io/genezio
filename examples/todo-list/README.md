# Todo App example

This is an example of a todo application with users, auth and tasks that uses React for the frontend application and Genezio for deploying and developing the backend.

## Initialization

1. Run `npm install` in the `backend/` folder to install the dependencies.
2. Run `npm install` in the `frontend/` folder to install the dependencies.
3. Change in the `backend/helper.js` file the variable `MONGO_DB_URI` to point to your MongoDB. We recommend the free tier from MongoDB Atlas (https://www.mongodb.com/atlas/database).

## Run the example locally

1. Run `genezio local` in the project's folder to start the local server.
2. Start the React app by going to the `frontend/` folder and run `npm start`.

## Deploy the example in the Genezio infrastructure

1. Run `genezio deploy` in the project's root folder that contains also the `genezio.yaml` file. This will deploy your code in the Genezio infrastructure and it will also create an SDK that can be used to call the methods remotely.
2. Start the React app by going to the `frontend/` folder and run `npm start`.
