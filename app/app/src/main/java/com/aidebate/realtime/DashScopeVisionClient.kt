package com.aidebate.realtime

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

object DashScopeVisionClient {

    private const val TAG = "DashScopeVisionClient"
    private const val API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"

    private val httpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    /**
     * Analyze image using DashScope's multimodal vision model (qwen3.8-flash).
     * Extracts text, formulas, diagrams, and visual details to provide context for Realtime voice.
     */
    suspend fun analyzeImage(apiKey: String, base64Jpeg: String): Result<String> = withContext(Dispatchers.IO) {
        if (apiKey.isBlank()) {
            return@withContext Result.failure(Exception("请先配置 DashScope API Key"))
        }

        try {
            val contentArray = JSONArray().apply {
                // 1. Image part
                put(JSONObject().apply {
                    put("type", "image_url")
                    put("image_url", JSONObject().apply {
                        put("url", "data:image/jpeg;base64,$base64Jpeg")
                    })
                })
                // 2. Text instruction
                put(JSONObject().apply {
                    put("type", "text")
                    put("text", "请以助教的角度详细识别并提取这张图片的所有核心信息：\n1. 如果是作业题目或试卷，请完整提取题目文字、选项、数学/理科公式与要点；\n2. 如果是科普/实物/自然照片，请详细描述画面中的主体、细节特征。\n直接输出结构化要点，无需开场白。")
                })
            }

            val messagesArray = JSONArray().apply {
                put(JSONObject().apply {
                    put("role", "user")
                    put("content", contentArray)
                })
            }

            val requestJson = JSONObject().apply {
                put("model", "qwen3.8-flash")
                put("messages", messagesArray)
                put("max_tokens", 800)
            }

            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestBody = requestJson.toString().toRequestBody(mediaType)

            val request = Request.Builder()
                .url(API_URL)
                .addHeader("Authorization", "Bearer ${apiKey.trim()}")
                .post(requestBody)
                .build()

            val response = httpClient.newCall(request).execute()
            val responseBody = response.body?.string() ?: ""

            if (!response.isSuccessful) {
                Log.e(TAG, "Vision API error code: ${response.code}, body: $responseBody")
                val errMsg = parseErrorMessage(responseBody, response.code)
                return@withContext Result.failure(Exception(errMsg))
            }

            val json = JSONObject(responseBody)
            val choices = json.optJSONArray("choices")
            if (choices != null && choices.length() > 0) {
                val firstChoice = choices.getJSONObject(0)
                val message = firstChoice.optJSONObject("message")
                val content = message?.optString("content", "")?.trim() ?: ""
                if (content.isNotEmpty()) {
                    return@withContext Result.success(content)
                }
            }

            Result.failure(Exception("视觉识别未能解析出有效内容"))
        } catch (e: Exception) {
            Log.e(TAG, "Vision recognition exception", e)
            Result.failure(e)
        }
    }

    private fun parseErrorMessage(body: String, code: Int): String {
        return try {
            val json = JSONObject(body)
            val error = json.optJSONObject("error")
            val msg = error?.optString("message")
            if (!msg.isNullOrBlank()) msg else "服务器响应错误 ($code)"
        } catch (e: Exception) {
            "请求失败 (HTTP $code)"
        }
    }
}
