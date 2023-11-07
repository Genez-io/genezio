export const template = `
/**
* KOTLIN 
* This is an auto generated code. This code should not be modified since the file can be overwritten
* if new genezio commands are executed.
*/
package {{packageName}}

import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.*
import org.http4k.core.HttpHandler
import org.http4k.core.Method.OPTIONS
import org.http4k.core.Method.POST
import org.http4k.core.Request
import org.http4k.core.Response
import org.http4k.core.Status.Companion.OK
import org.http4k.core.then
import org.http4k.filter.AllowAll
import org.http4k.filter.CorsPolicy
import org.http4k.filter.OriginPolicy
import org.http4k.filter.ServerFilters
import org.http4k.routing.bind
import org.http4k.routing.routes
import org.http4k.server.SunHttp
import org.http4k.server.asServer
import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import kotlinx.coroutines.runBlocking

@Serializable
data class JsonRpcRequest(
        val jsonrpc: String,
        val id: Int,
        val method: String,
        val params: JsonArray,
)

@Serializable
data class NewRequest(
    val body : String
)

@Serializable
data class NewResponse(
    val body : String,
    val statusCode : Int,
    val headers : Map<String, String>,
)

private val json = Json { ignoreUnknownKeys = true }

class LambdaHandler : RequestHandler<Map<String, Any>, String> { 
  override fun handleRequest(event: Map<String, Any>, context : Context): String {
      var response : String
      val headers = mapOf(
        "Content-Type" to "application/json",
        "X-Powered-By" to "genezio"
      )
      var status = 200
      try {
        runBlocking {
          response = processRequest(NewRequest(event["body"] as String))
        }
      }
      catch (e : Exception) {
        println("Error: $e")
        val escapedErr = e.toString().replace("\\"", "\\\\\\"")
        status = 500
        response = "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Error while calling method : [$escapedErr]\\",\\"id\\":\\"-1\\"}"
        response = json.encodeToString(NewResponse(response, status, headers))
      }
      
      return response
  }
}

fun processRequestDirect(json_rpc : String): String {
  // Note: Excluding the first and last character of the string to remove the quotes
  //       necessary for genezio runtime
  var response : String
  runBlocking {
    response = processRequest(NewRequest(json_rpc.substring(1, json_rpc.length - 1)))
  }

  return response
}

suspend fun processRequest(event: NewRequest): String {
    // Get request body
    val request: JsonRpcRequest
    try {
        request = json.decodeFromString(event.body)
    } catch (e: Exception) {
        println("Error: $e")
        val escapedErr = e.toString().replace("\\"", "\\\\\\"").replace("\\n", "\\\\n")
        return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Error with request format : [$escapedErr]\\",\\"id\\":\\"-1\\"}"
    }

    val reqId = request.id
    val method = request.method
    val params = request.params
    
    // Test if class is instantiable
    try {
        {{className}}()
    } catch (e: Exception) {
        println("Error: $e")
        println("Class could not be instantiated. Check logs for more information")
        return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Class could not be instantiated. Check logs for more information.\\",\\"id\\":\\"$reqId\\"}"
    }

    try {
      when (method) {
          {{#jsonRpcMethods}}
          "{{className}}.{{name}}" -> {
              {{#parameters}}
              val param{{index}} = {{{cast}}}
              {{/parameters}}
              val funcRes = {{className}}().{{name}}({{#parameters}}param{{index}}{{^last}},{{/last}}{{/parameters}});
              val resStr = Json.encodeToString(funcRes)
              return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":$resStr,\\"id\\":\\"$reqId\\"}"
          }
          {{/jsonRpcMethods}}
          else -> {
              println("Error: Method $method not found.")
              return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Method not found.\\",\\"id\\":\\"$reqId\\"}"
          }
      }
    } catch (e : Exception) {
        val escapedErr = e.toString().replace("\\"", "\\\\\\"")
        return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Error while calling method : [$escapedErr]\\",\\"id\\":\\"$reqId\\"}"
    }
 
}

`;
