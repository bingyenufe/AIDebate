package com.aidebate.realtime

import android.util.Base64
import android.util.Log
import okhttp3.*
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

interface RealtimeListener {
    fun onConnected()
    fun onDisconnected(reason: String)
    fun onError(error: String)
    fun onUserSpeaking()
    fun onAiSpeaking()
    fun onAiFinishedSpeaking()
    fun onAudioDeltaReceived(pcmBytes: ByteArray)
}

class RealtimeAudioClient(
    private val listener: RealtimeListener
) {
    companion object {
        private const val TAG = "RealtimeAudioClient"
        private const val BASE_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/realtime?model=qwen3.5-omni-flash-realtime"
    }

    private val client = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .pingInterval(15, TimeUnit.SECONDS)
        .build()

    private var webSocket: WebSocket? = null
    private var isConnected = false

    fun connect(apiKey: String, systemPrompt: String, voice: String = "Cherry") {
        if (apiKey.isBlank()) {
            listener.onError("未配置 API Key，请在右上角设置中填写")
            return
        }

        val request = Request.Builder()
            .url(BASE_URL)
            .addHeader("Authorization", "Bearer ${apiKey.trim()}")
            .build()

        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                Log.d(TAG, "WebSocket connection opened to DashScope Realtime")
                isConnected = true
                sendSessionUpdate(systemPrompt, voice)
                listener.onConnected()
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                handleServerEvent(text)
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                Log.d(TAG, "WebSocket closing: $code / $reason")
                isConnected = false
                val reasonText = if (reason.isNotBlank()) " ($reason)" else ""
                if (code != 1000) {
                    listener.onError("连接被服务端断开 (状态码 $code$reasonText)")
                } else {
                    listener.onDisconnected(reason)
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                isConnected = false
                val respBody = try { response?.body?.string() } catch (e: Exception) { null }
                val errorMsg = when {
                    response?.code == 401 -> "鉴权失败 (401)：请检查您的 API Key 是否正确"
                    response?.code == 403 -> "权限不足 (403)：请检查您的账户权限或欠费状态"
                    response?.code == 400 -> "请求错误 (400)：${respBody ?: "参数错误"}"
                    response != null -> "连接异常 (${response.code})：${respBody ?: response.message}"
                    else -> "网络连接失败: ${t.localizedMessage ?: "无法连接到服务器，请检查网络"}"
                }
                listener.onError(errorMsg)
            }
        })
    }

    fun sendSessionUpdate(instructions: String, voice: String) {
        // DashScope Realtime requires modalities to be ["text", "audio"]
        val modalitiesArray = JSONArray().apply {
            put("text")
            put("audio")
        }

        val sessionObj = JSONObject().apply {
            put("modalities", modalitiesArray)
            put("instructions", instructions)
            put("voice", voice)
            put("input_audio_format", "pcm")
            put("output_audio_format", "pcm")
            put("turn_detection", JSONObject().apply {
                put("type", "server_vad")
                put("threshold", 0.5)
                put("silence_duration_ms", 800)
            })
        }

        val event = JSONObject().apply {
            put("type", "session.update")
            put("session", sessionObj)
        }

        webSocket?.send(event.toString())
        Log.d(TAG, "Sent session.update: $event")
    }

    fun sendAudioChunk(pcmBytes: ByteArray) {
        if (!isConnected || webSocket == null) return
        val base64Audio = Base64.encodeToString(pcmBytes, Base64.NO_WRAP)
        val event = JSONObject().apply {
            put("type", "input_audio_buffer.append")
            put("audio", base64Audio)
        }
        webSocket?.send(event.toString())
    }

    private fun handleServerEvent(jsonText: String) {
        try {
            val event = JSONObject(jsonText)
            val type = event.optString("type")
            when (type) {
                "error" -> {
                    val errorObj = event.optJSONObject("error")
                    val msg = errorObj?.optString("message") 
                        ?: errorObj?.optString("code") 
                        ?: jsonText
                    Log.e(TAG, "DashScope error event: $msg")
                    listener.onError("DashScope服务错误: $msg")
                }
                "session.created" -> {
                    Log.d(TAG, "DashScope session created: $jsonText")
                }
                "session.updated" -> {
                    Log.d(TAG, "DashScope session updated successfully")
                }
                "response.audio.delta" -> {
                    val deltaBase64 = event.optString("delta")
                    if (deltaBase64.isNotEmpty()) {
                        val pcmBytes = Base64.decode(deltaBase64, Base64.DEFAULT)
                        listener.onAudioDeltaReceived(pcmBytes)
                        listener.onAiSpeaking()
                    }
                }
                "input_audio_buffer.speech_started" -> {
                    listener.onUserSpeaking()
                }
                "response.audio.done", "response.done" -> {
                    listener.onAiFinishedSpeaking()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to parse server event: $jsonText", e)
        }
    }

    fun disconnect() {
        isConnected = false
        webSocket?.close(1000, "User ended call")
        webSocket = null
    }
}
