# Webhook example

Sometimes we might need to communicate directly over HTTP instead of JSONRPC. In this example, the `helloWorldOverHttp` implemented in `HelloWorldHttpExample` class will be triggered by an HTTP request.

## Run the example locally

Run `genezio local` in the `server/` folder. This will start a local web server. The URL will be printed and it can be used to send requests to the method.

## Deploy the example in the Genezio infrastructure

Run `genezio deploy` in the `/server` folder.

In the `/client` folder you can find a `test-webhook-example.js` that sends different types of HTTP requests. You can run it with `node test-webhook-example.js`.