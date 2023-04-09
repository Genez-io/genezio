export const template = `
/**
* This is an auto generated code. This code should not be modified since the file can be overwriten
* if new genezio commands are executed.
*/

import 'package:aws_lambda_dart_runtime/aws_lambda_dart_runtime.dart';
import 'dart:convert';

import './lib/{{classFileName}}.dart';

void main() async {
  final service = {{className}}();

  /// This demo's handling an ALB request.
  final Handler<AwsALBEvent> handler = (context, event) async {
    var response;
    var body = event.body;

    if (body == null) {
      return AwsALBResponse(
        statusCode: 400,
        body: "No body",
      );
    }

    Map<String, dynamic> map = jsonDecode(body);

    final method = (map["method"] as String).split(".")[1];
    final params = map["params"];

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
    return response;
  };

  /// The Runtime is a singleton.
  /// You can define the handlers as you wish.
  Runtime()
    ..registerHandler<AwsALBEvent>("index.handler", handler)
    ..invoke();
}

`;