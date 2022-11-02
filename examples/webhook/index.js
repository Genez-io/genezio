export class HelloWorldCronExample {
  helloWorld() {
    return {
      message: `Hello, ${"radu"}!`
    };
  }

  helloWorldOverHttp(request) {
    const name = JSON.parse(request.body).name;

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
