export class HelloWorldCronExample {
  helloWorld(name) {
    return {
      message: `Hello, ${name}!`
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
