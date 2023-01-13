import axios from 'axios';
import FormData from 'form-data'

(async () => {
    const url = "https://ie2bltyns675yoaphzij62gq2a0mtazj.lambda-url.us-east-1.on.aws";

    // Send the query params request
    let response = await axios.get(url + "/HelloWorldHttpExample/handleQueryParams?name=john")
    console.log(response.data)

    // Send the request with plain text
    response = await axios.post(url + "/HelloWorldHttpExample/handleSimpleTextRequest", "text in body", { headers: { "content-type": "text/html" } });
    console.log(response.data)

    // Send the request with JSON body
    response = await axios.post(url + "/HelloWorldHttpExample/handleJsonBody", {
        name: "John"
    })
    console.log(response.data)

    // Send the request with multipart file
    const formData = new FormData();
    formData.append('myFile', "contents of file");
    
    response = await axios.post(url + "/HelloWorldHttpExample/handleMultipartData", formData, {
      headers: formData.getHeaders()
    });
    console.log(response.data)
})();
 