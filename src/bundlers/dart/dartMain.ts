export const template = `
/// This is an auto generated code. This code should not be modified since the file can be overwritten
/// if new genezio commands are executed.

import 'package:aws_lambda_dart_runtime/aws_lambda_dart_runtime.dart';
import 'dart:convert';
import 'dart:typed_data';

{{#imports}}
import '{{{name}}}';
{{/imports}}

void main() async {
  var service;
  try {
    service = {{className}}();
  } catch(e) {
  }

  // ignore: prefer_function_declarations_over_variables
  final Handler<Map<String, dynamic>> handler = (context, event) async {
    var response;

    // Define headers for the response
    final headers = {
      'Content-Type': 'application/json',
      'X-Powered-By': 'genezio'
    };

    var eventBody = null;
    try {
      eventBody = jsonDecode(event["body"]);
    } catch (e) {}

    final isJsonRpcRequest = eventBody != null && eventBody["jsonrpc"] != null && eventBody["jsonrpc"] == "2.0";

    if (event["genezioEventType"] == "cron") {
      final method = event["methodName"];
      switch (method) {
        {{#cronMethods}}
        case "{{name}}":
          {
            try {
              if (service == null) {
                response = '{"jsonrpc": "2.0", "result": "{{className}} could not be instantiated. Check logs for more information.", "id": 0}';
                break;
              }

              final result = await service.{{name}}();
              response = {"jsonrpc": "2.0", "result": result, "id": 0};
            } catch(e, s) {
              print("Error:" + e.toString());
              print("Stack Trace:" + s.toString());
              response = {"jsonrpc": "2.0", "result": e.toString(), "id": 0};
            }
            break;
          }
        {{/cronMethods}}
        default:
          response = {"jsonrpc": "2.0", "result": "No cron method found.", "id": 0};
        break;
      };
    } else if (event["requestContext"]["http"]["method"] == "OPTIONS") {
      final response = {
        "statusCode": 200,
        "headers": headers,
      };
      return response;
    } else if (!isJsonRpcRequest) {
      final method = event["requestContext"]["http"]["path"].split("/").last;

      var httpResponse;
      switch (method) {
        {{#httpMethods}}
        case "{{name}}":
          {
            if (service == null) {
              response = {"statusCode": 500, "headers": headers, "body": "{{className}} could not be instantiated. Check logs for more information."};
              return response;
            }

            try {
              Codec<String, String> stringToBase64 = utf8.fuse(base64);
              var body = event["body"];

              try {
                body = jsonDecode(event["body"]);
              } catch (e) {}

              final Map<String, dynamic> req = Map.from({
                "headers": event["headers"],
                "http": event["requestContext"]["http"],
                "queryStringParameters": event["queryStringParameters"],
                "timeEpoch": event["requestContext"]["timeEpoch"],
                "body": (event["isBase64Encoded"] != null && event["isBase64Encoded"] == true)
                    ? stringToBase64.decode(event["body"])
                    : body,
                "rawBody": event["body"],
              });

              httpResponse = await service.{{name}}(req);
            } catch(e, s) {
              print("Error:" + e.toString());
              print("Stack Trace:" + s.toString());
              httpResponse = {"statusCode": 500, "headers":headers, "body": "\${e.toString()}"};
            }
            break;
          }
        {{/httpMethods}}
        default:
          httpResponse = {"statusCode": 404, "headers": headers, "body": "No HTTP method found."};
          break;
      }

      try {
      if (httpResponse is Map && httpResponse["statusCode"] == null) {
        httpResponse["statusCode"] = 200;
      }

      if (httpResponse["body"] is Uint8List) {
        httpResponse["body"] = base64.encode(httpResponse["body"]);
        httpResponse["isBase64Encoded"] = true;
      } else if (httpResponse["body"] is Map) {
        try {
          httpResponse["body"] = jsonEncode(httpResponse["body"]);
        } catch (error) {}
      }
      } catch (e, s) {
        print("Error:" + e.toString());
        print("Stack Trace:" + s.toString());
        httpResponse = {"statusCode": 500, "headers":headers, "body": e.toString()};
      }

      return httpResponse;
    } else {
    Map<String, dynamic> map = jsonDecode(event["body"]);

    final method = (map["method"] as String).split(".")[1];
    final params = map["params"];

    switch(method) {
    {{#jsonRpcMethods}}
    case "{{name}}": {
      if (service == null) {
        response = {"jsonrpc": "2.0", "result": "{{className}} could not be instantiated. Check logs for more information.", "id": 0};
        break;
      }

      try {
      {{#parameters}}
          final param{{index}} = {{{cast}}};
      {{/parameters}}
      final result = await service.{{name}}({{#parameters}}param{{index}}{{^last}},{{/last}}{{/parameters}});
      response = {"jsonrpc": "2.0", "result": result, "id": 0};
      } catch(e, s) {
        print("Error:" + e.toString());
        print("Stack Trace:" + s.toString());
        response = {"jsonrpc": "2.0",  "result": "\${e.toString()}", "id": 0};
        final jsonResponse = jsonEncode(response);
        return {
          "statusCode": 500,
          "headers": headers,
          "body": jsonResponse
        };
      }

      final jsonResponse = jsonEncode(response);
      return {
        "statusCode": 200,
        "headers": headers,
        "body": jsonResponse
      };
    }
    {{/jsonRpcMethods}}
    default:
      response = {"jsonrpc": "2.0", "result": "No JSONRPC method found.", "id": 0};
      final jsonResponse = jsonEncode(response);
      return {
        "statusCode": 404,
        "headers": headers,
        "body": jsonResponse
      };
  };
  }

  // Create a http response object
  final jsonResponse = jsonEncode(response);
  return {
    "statusCode": 200,
    "headers": headers,
    "body": jsonResponse
  };
};

  /// The Runtime is a singleton.
  /// You can define the handlers as you wish.
  Runtime()
    ..registerEvent<Map<String, dynamic>>((Map<String, dynamic> json) => json)
    ..registerHandler<Map<String, dynamic>>("index.handler", handler)
    ..invoke();
}
`;
