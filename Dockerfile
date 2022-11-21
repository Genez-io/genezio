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

# Mock `genezio login`
# Install utilities for keyring
RUN apt install --quiet --yes \
    gnome-keyring \
    dbus-x11 \
    libsecret-tools \
    libsecret-1-dev

# These instruction have to be executed in a privileged mode
# RUN eval $(/usr/bin/dbus-launch --auto-syntax)
# RUN echo $DBUS_SESSION_BUS_ADDRESS
# RUN --security=insecure echo '\n' | gnome-keyring-daemon --unlock
# RUN secret-tool store --label="genez.io/Andreia Ocanoaia" account "Andreia Ocanoaia" service "genez.io" < pass.txt
# RUN secret-tool lookup account "Andreia Ocanoaia" service "genez.io"

# FROM base as test-hello
# RUN apt install apt install python3 python3-pip -y
# WORKDIR /root/genezio/hello-world
# RUN npm install
# RUN python3 test.py
