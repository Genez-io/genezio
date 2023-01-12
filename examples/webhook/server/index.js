const multipart = require("parse-multipart-data");

export class HelloWorldCronExample {
  helloWorld() {
    return {
      message: `Hello, ${"John"}!`
    };
  }

  handleSimpleTextRequest(request) {
    console.log(`Request received with simple text ${request.body}!`)

    return {
      body: request.body,
      headers: { "content-type": "text/html" },
    }
  }

  /**
   * @param request
   * @param request.headers - request headers
   * @param request.http - http method (GET, POST, etc)
   * @param request.queryParameters - query parameters from the request URL
   * @param request.timeEpoch - time in milliseconds since epoch
   * @param request.body - your request body
  */
  handleJsonBody(request) {
    console.log(`Request received with body ${request.body}!`)
    if (!request.body.name) {
      throw Error("Missing parameter name")
    }

    const name = request.body.name

    return {
      body: {
        name
      },
      bodyEncoding: "text",
      headers: { testHeader: "testHeaderValue" },
      statusCode: "201",
      statusDescription: "Ok"
    };
  }

  handleQueryParams(request) {
    console.log(`Request received with query params ${request.queryStringParameters}!`)
    if (!request.queryStringParameters.name) {
      throw Error("Missing parameter name")
    }

    return {
      body: "Ok",
      headers: { "content-type": "text/html" },
    }
  }

  handleMultiparthData(request) {
    console.log("Request receive with multipart data")

    const body = Buffer.from(request.body, "base64");
    const entries = multipart.parse(
      body,
      multipart.getBoundary(request.headers["content-type"])
    );

    const file = entries.find((entry) => entry.name === "myFile");

    return {
      body: file.data,
      isBase64Encoded: true,
      headers: { "content-type": "application/octet-stream" }
    }
  }
}
