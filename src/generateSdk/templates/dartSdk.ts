export const dartSdk = `/// This is an auto generated code. This code should not be modified since the file can be overwritten
/// if new genezio commands are executed.

import 'dart:convert';
import 'package:http/http.dart' as http;

/// The class through which all request to the genezio backend will be passed.
class Remote {
  final String url;

  Remote(this.url);

  dynamic makeRequest(Map<String, dynamic> requestContent, String url) async {
    var headers = {'content-type': 'application/json'};
    var response = await http.post(Uri.parse(url),
        headers: headers, body: jsonEncode(requestContent));
    return jsonDecode(response.body);
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
        throw Exception(response['error']['message']);
      } else {
        return response['result'];
      }
    } else {
      throw Exception('No response from server');
    }
  }
}
`;
