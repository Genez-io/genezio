export class HelloWorldCronExample {
  helloWorld() {
    return {
      message: `Hello, ${"John"}!`
    };
  }

  /**
   * @param request
   * @param request.headers - request headers
   * @param request.http - http method (GET, POST, etc)
   * @param request.queryParameters - query parameters from the request URL
   * @param request.timeEpoch - time in milliseconds since epoch
   * @param request.body - your request body
  */
  helloWorldOverHttp(request) {
    console.log("Request received!")
    const name = request.body ? JSON.parse(request.body).name : "No name";

    console.log(name);

    return {
      body: JSON.stringify({
        name
      }),
      bodyEncoding: "text",
      headers: { testHeader: "testHeaderValue" },
      statusCode: "201",
      statusDescription: "Ok"
    };
  }
}
