export const kotlinSdk = `
package com.genezio.sdk

import com.google.gson.Gson
import com.google.gson.JsonElement

import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.POST

import java.lang.reflect.Type

data class JSON_RPC_REQUEST(
    val jsonrpc : String = "2.0",
    val id: Int = 1,
    val params: List<JsonElement>,
    val method: String
)

data class JSON_RPC_RES(
    val jsonrpc: String,
    val id: Int,
    val result: JsonElement,
)

data class JSON_RPC_ERR(
    val jsonrpc: String,
    val id: Int,
    val result: JsonElement,
)

class Remote(private val BASE_URL: String){
    interface GenezioCallAPI {
        @POST(".")
        suspend fun genezioCall(@Body body: JSON_RPC_REQUEST) : JSON_RPC_RES
    }

    val retrofit = Retrofit.Builder()
        .baseUrl(BASE_URL)
        .addConverterFactory(GsonConverterFactory.create())
        .build()

    val apiService = retrofit.create(GenezioCallAPI::class.java)

    val gson = Gson()
    suspend fun <T> makeRequest(typeToken: Type, method : String, args : List<JsonElement> = listOf()): T {
        val body = JSON_RPC_REQUEST(
            jsonrpc = "2.0",
            id = 1,
            method= method,
            params = args
        )

        val resultRaw = apiService.genezioCall(body)
        return gson.fromJson(resultRaw.result, typeToken)
    }
}

`;
