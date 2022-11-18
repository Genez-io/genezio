export class HelloWorldCronExample {
  helloWorld() {
    return {
      message: `Hello, ${"radu"}!`
    };
  }

  helloWorldOverHttp(request) {
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
