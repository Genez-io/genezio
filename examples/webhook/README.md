# Webhook example

Sometimes we might need to communicate directly over HTTP instead of JSONRPC. In this example, the `helloWorldOverHttp` implemented in `HelloWorldCronExample` class will be triggered by an HTTP request.

## Run the example locally

Run `genezio local` in the `server/` folder. This will start a local web server. The URL will be printed and it can be used to send requests to the method.

## Deploy the example in the Genezio infrastructure

Run `genezio deploy` in the `/server` folder.
