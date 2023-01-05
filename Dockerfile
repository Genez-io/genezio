FROM node:latest AS base

RUN apt update -y && apt upgrade -y 

# Copy genezio local files
# Some files are ignored via .dockerignore
COPY . /root/genezio
WORKDIR /root/genezio

# Install genezio locally (dev branch)
RUN npm install && npm run install-locally-dev && npm run build-dev && npm install -g

# Install python for testing
RUN apt install python3 python3-pip -y
RUN python3 -m pip install termcolor requests logging socket

FROM base AS test

# Prepare examples for testing
RUN cd examples/todo-list/server && npm install
RUN cd examples/todo-list/client && npm install
RUN cd examples/todo-list-ts/server && npm install
RUN cd examples/todo-list-ts/client && npm install
RUN cd examples/blockchain/server && npm install
RUN cd examples/blockchain/client && npm install
