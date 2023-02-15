FROM node:latest AS base

ARG STAGE="dev"
RUN apt update -y && apt upgrade -y 

# Copy genezio local files
# Some files are ignored via .dockerignore
COPY . /root/genezio
WORKDIR /root/genezio

# Install genezio (development or production)
RUN echo "Stage is set to $STAGE"
RUN if [ $STAGE = "dev" ]; then npm install && npm run install-locally-dev && npm run build-dev && npm install -g; fi

# Test if genezio is installed coorectly
RUN echo -n "genezio version: " && genezio --version

# Install python for running end-to-end tests
RUN apt install python3 python3-pip -y
RUN python3 -m pip install termcolor requests pyyaml

FROM base AS test

# Prepare examples for testing
RUN cd examples/javascript/todo-list/server && npm install
RUN cd examples/javascript/todo-list/client && npm install
RUN cd examples/typescript/todo-list/server && npm install
RUN cd examples/typescript/todo-list/client && npm install
RUN cd examples/javascript/blockchain/server && npm install
RUN cd examples/javascript/blockchain/client && npm install