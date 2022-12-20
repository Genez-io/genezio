FROM node:latest as base

RUN apt update -y && apt upgrade -y 

# Copy genezio local files
# Some files are ignored via .dockerignore
COPY . /root/genezio
WORKDIR /root/genezio

# Make sure genezio uses `dev`
RUN sed -i -E 's/REACT_APP_BASE_URL = ".*";/REACT_APP_BASE_URL = "https:\/\/dev.app.genez.io";/' src/variables.ts
RUN sed -i -E 's/BACKEND_ENDPOINT = ".*";/BACKEND_ENDPOINT = "https:\/\/dev.api.genez.io";/' src/variables.ts
RUN sed -i -E 's/GENERATE_SDK_API_URL = ".*";/GENERATE_SDK_API_URL = "https:\/\/dev-sdk-api.genez.io";/' src/variables.ts

# Install genezio locally
RUN npm install && npm run build && npm i -g

# Install python for testing
RUN apt install python3 python3-pip -y
RUN python3 -m pip install termcolor

FROM base as test

# Prepare examples for testing
RUN cd examples/todo-list/server && npm install
RUN cd examples/todo-list/client && npm install
RUN cd examples/blockchain/server && npm install
RUN cd examples/blockchain/client && npm install
