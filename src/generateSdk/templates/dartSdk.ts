export const dartSdk = `/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import 'dart:convert';
import 'dart:io';

/**
 * The class through which all request to the Genezio backend will be passed.
 */
class Remote {
  final String url;

  Remote(this.url);

  dynamic makeRequest(Map<String, dynamic> requestContent, String url) async {
    var data = utf8.encode(jsonEncode(requestContent));
    var headers = {'content-type': 'application/json'};
    var request = await HttpClient().postUrl(Uri.parse(url))
      ..headers.set('content-type', 'application/json');
    headers.forEach((key, value) => request.headers.set(key, value));
    request.add(data);
    var response = await request.close();
    var resp = await utf8.decoder.bind(response).join();
    return jsonDecode(resp);
  }

  dynamic call(String method, [List<dynamic>? args]) async {
    var requestContent = {
      "jsonrpc": "2.0",
      "method": method,
      "params": args,
      "id": 3
    };
    var response = await makeRequest(requestContent, url);

    if (response != null) {
      if (response['error'] != null) {
        return response['error'];
      } else {
        return response['result'];
      }
    } else {
      throw Exception('No response from server');
    }
  }
}
`;
