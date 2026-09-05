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

    fun connect(apiKey: String, systemPrompt: String, voice: String = "cherry") {
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
                listener.onDisconnected(reason)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                Log.e(TAG, "WebSocket failure", t)
                isConnected = false
                val errorMsg = if (response?.code == 401) {
                    "鉴权失败 (401)：请检查您的 API Key 是否正确"
                } else {
                    "连接失败: ${t.localizedMessage ?: "网络错误"}"
                }
                listener.onError(errorMsg)
            }
        })
    }

    fun sendSessionUpdate(instructions: String, voice: String) {
        val modalitiesArray = JSONArray().apply {
            put("audio")
        }

        val sessionObj = JSONObject().apply {
            put("modalities", modalitiesArray)
            put("instructions", instructions)
            put("voice", voice)
            put("turn_detection", JSONObject().apply {
                put("type", "server_vad")
                put("threshold", 0.5)
                put("silence_duration_ms", 600)
            })
        }

        val event = JSONObject().apply {
            put("type", "session.update")
            put("session", sessionObj)
        }

        webSocket?.send(event.toString())
        Log.d(TAG, "Sent session.update")
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
            when (event.optString("type")) {
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
