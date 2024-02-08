export const template = `
/**
* GO
* This is an autogenerated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
 */
package main

import (
	"encoding/json"
    "errors"
    "context"
    "github.com/aws/aws-lambda-go/lambda"

    {{#imports}}
    {{#named}}{{name}} {{/named}}"{{{path}}}"
    {{/imports}}
)

type Event struct {
	Body string \`json:"body"\`
    GenezioEventType string \`json:"genezioEventType,omitempty"\`
    MethodName string \`json:"methodName,omitempty"\`
}

type EventBody struct {
	Id      int           \`json:"id"\`
	Method  string        \`json:"method"\`
	Params  []interface{} \`json:"params"\`
	Jsonrpc string        \`json:"jsonrpc"\`
}

type ResponseBody struct {
	Id      int         \`json:"id"\`
	Result  interface{} \`json:"result"\`
	Jsonrpc string      \`json:"jsonrpc"\`
}

type Response struct {
	StatusCode string            \`json:"statusCode"\`
	Body       string            \`json:"body"\`
	Headers    map[string]string \`json:"headers"\`
}

type ErrorStruct struct {
	Code    int    \`json:"code"\`
	Message string \`json:"message"\`
}

type ResponseBodyError struct {
	Id      int         \`json:"id"\`
	Error   ErrorStruct \`json:"error"\`
	Jsonrpc string      \`json:"jsonrpc"\`
}

func sendError(err error) *Response {
	var responseError ResponseBodyError
	responseError.Id = 0
	responseError.Error.Code = 500
	responseError.Error.Message = err.Error()
	responseError.Jsonrpc = "2.0"
    responseErrorByte, err := json.Marshal(responseError)
    if err != nil {
        return nil
    }
	response := &Response{
		StatusCode: "500",
		Body:       string(responseErrorByte),
		Headers: map[string]string{
			"Content-Type": "application/json",
			"X-Powered-By": "genezio",
		},
	}
    return response
}

func handleRequest(context context.Context, event *Event) (*Response, error) {
	var body EventBody
	var responseBody ResponseBody

	class := {{class.packageName}}.New()

    if event.GenezioEventType == "cron" {
        methodName := event.MethodName
        switch methodName {
        {{#cronMethods}}
        case "{{name}}":
            err := class.{{name}}()
            if err != nil {
                errorResponse := sendError(err)
                return errorResponse, nil
            }
        {{/cronMethods}}
        default:
            errorResponse := sendError(errors.New("Method not found"))
            return errorResponse, nil
        }
    } else {
        eventBody := []byte(event.Body)
        // Decode the request body into struct and check for errors
        err := json.Unmarshal(eventBody, &body)
        if err != nil {
            errorResponse := sendError(err)
            return errorResponse, nil
        }
        // Call the appropriate method
        switch body.Method {
        {{#jsonRpcMethods}}
        case "{{class.name}}.{{name}}":
            {{#parameters}}
            {{{cast}}}
            {{/parameters}}
            {{^isVoid}}result, {{/isVoid}}err {{^isVoid}}:{{/isVoid}}= class.{{name}}({{#parameters}}param{{index}}{{^last}}, {{/last}}{{/parameters}})
            if err != nil {
                errorResponse := sendError(err)
                return errorResponse, nil
            }
            {{^isVoid}}
            responseBody.Result = result
            {{/isVoid}}
        {{/jsonRpcMethods}}
        default:
            errorResponse := sendError(errors.New("Method not found"))
            return errorResponse, nil
        }
    }

	responseBody.Id = body.Id
	responseBody.Jsonrpc = body.Jsonrpc

    bodyString, err := json.Marshal(responseBody)
    if err != nil {
        errorResponse := sendError(err)
        return errorResponse, nil
    }

	response := &Response{
        StatusCode: "200",
		Body:       string(bodyString),
		Headers: map[string]string{
			"Content-Type": "application/json",
		},
	}

    return response, nil
}

func main() {
    lambda.Start(handleRequest)
}
`;