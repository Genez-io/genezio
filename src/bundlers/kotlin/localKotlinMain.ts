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
suspend fun processRequest(event: NewRequest): String {
    // Get request body
    val request: JsonRpcRequest
    try {
      request = json.decodeFromString(event.body)
    } catch (e: Exception) {
      println("Error: $e when decoding request body $event")
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
              println("Method not found.")
              return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Method not found.\\",\\"id\\":\\"$reqId\\"}"
          }
      }
    } catch (e : Exception) {
        val escapedErr = e.toString().replace("\\"", "\\\\\\"")
        return "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Error while calling method : [$escapedErr]\\",\\"id\\":\\"$reqId\\"}"
    }
}

fun main(args: Array<String>) {
  var port: Int = 8080
  if (args.size == 1) {
    port = Integer.parseInt(args[0])
  }

  val router: HttpHandler =
      ServerFilters.Cors(
              CorsPolicy(
                  OriginPolicy.AllowAll(),
                  headers = listOf("accept", "authorization", "content-type"),
                  methods = listOf(POST,OPTIONS)
              )
          )
          .then(
              routes(
                  "/" bind
                      POST to { req: Request ->
                        val headers = mapOf(
                            "Content-Type" to "application/json",
                            "X-Powered-By" to "genezio"
                        )
                        var reqBody : NewRequest
                        try {
                          // try to decode as jsonrpc
                          reqBody = json.decodeFromString<NewRequest>(req.bodyString())
                        } catch (e: Exception) {
                          println("Error first decode attempt: $e")
                          reqBody = NewRequest(req.bodyString())
                        } catch (e: Exception) {
                          // return error if not jsonrpc
                          println("Error: $e")
                          val err_msg = "{\\"jsonrpc\\":\\"2.0\\",\\"result\\":\\"Error while deserialising input.\\",\\"id\\":\\"-1\\"}"
                          return@to Response(OK).body(json.encodeToString(NewResponse(err_msg, 500, headers) )).header("Content-Type", "application/json")
                        }
                        var response : String
                        runBlocking {
                          response = processRequest(reqBody)
                        }
                        Response(OK).body(json.encodeToString(NewResponse(response, 200, headers) )).header("Content-Type", "application/json")
                      },
              )
          )

  try {
    router.asServer(SunHttp(port)).start()
  } catch (e: Exception) {
    println("Error: $e")
  }
}
`;
