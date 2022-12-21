export class HelloWorldCronExample {
  helloWorld() {
    return {
      message: `Hello, ${"John"}!`
    };
  }

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
