export const template = `
/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import 'dart:convert';
import 'dart:io';

import './lib/{{classFileName}}.dart';

void main(List<String> args) async {
  final port = int.tryParse(args.isNotEmpty ? args[0] : '') ?? 3000;
  final service = {{className}}();
  var response;

  print('Listening on port $port...');
  final server = await HttpServer.bind(InternetAddress.anyIPv4, port);

  await for (HttpRequest req in server) {
    if (req.method == 'POST') {
      final body = await utf8.decoder.bind(req).join();

      Map<String, dynamic> map = jsonDecode(body);

      final jsonRpcRequest = jsonDecode(map["body"]);
      final method = (jsonRpcRequest["method"] as String).split(".")[1];
      final params = jsonRpcRequest["params"];
    
      switch(method) {
      {{#methods}}
        case "{{name}}": {
          {{#parameters}}
            {{#isNative}}
              final param{{index}} = params[{{index}}]{{#cast}}{{cast}}{{/cast}};
            {{/isNative}}
            {{^isNative}}
              Map<String, dynamic> _dict{{index}} = params[{{index}}];
              final param{{index}} = {{{type}}}.fromJson(_dict{{index}});
            {{/isNative}}
          {{/parameters}}
          final result = service.{{name}}({{#parameters}}param{{index}}{{^last}},{{/last}}{{/parameters}});
          final json = jsonEncode(result);
          response = '{"jsonrpc": "2.0", "result": $json, "id": 0}';
          break;
        }
      {{/methods}}
      };

      req.response
        ..headers.contentType = ContentType.json
        ..write(response);
    } else {
      req.response
        ..statusCode = HttpStatus.notFound
        ..write('404 Not Found');
    }
    await req.response.close();
  }

  print('End!');
}

`;