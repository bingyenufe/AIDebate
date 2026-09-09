package com.aidebate.realtime

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.LinkedBlockingQueue

/**
 * AudioStreamManager handles low-latency mic recording (16kHz PCM)
 * and high-volume real-time audio playback (24kHz PCM) using media speaker output.
 */
class AudioStreamManager {

    companion object {
        private const val TAG = "AudioStreamManager"
        private const val PCM_GAIN_FACTOR = 1.8f // 1.8x amplification for outdoor speech clarity
    }

    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null

    private var recordingJob: Job? = null
    private var playbackJob: Job? = null

    private val audioPlaybackQueue = LinkedBlockingQueue<ByteArray>()

    @Volatile
    private var isRecording = false

    @Volatile
    private var isPlaying = false

    @Volatile
    private var isAiSpeaking = false

    private val trackLock = Any()

    @SuppressLint("MissingPermission")
    fun startRecording(scope: CoroutineScope, onAudioChunk: (ByteArray) -> Unit) {
        if (isRecording) return

        try {
            val sampleRate = 16000
            val channelConfig = AudioFormat.CHANNEL_IN_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            val bufferSize = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat).coerceAtLeast(3200)

            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.VOICE_COMMUNICATION,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )

            if (audioRecord?.state == AudioRecord.STATE_INITIALIZED) {
                audioRecord?.startRecording()
                isRecording = true

                recordingJob = scope.launch(Dispatchers.IO) {
                    val buffer = ByteArray(1600) // 50ms chunk at 16kHz 16-bit
                    while (isActive && isRecording) {
                        val readBytes = audioRecord?.read(buffer, 0, buffer.size) ?: -1
                        if (readBytes > 0) {
                            val chunk = buffer.copyOf(readBytes)
                            onAudioChunk(chunk)
                        }
                    }
                }
            } else {
                Log.e(TAG, "AudioRecord failed to initialize")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting AudioRecord", e)
        }
    }

    fun stopRecording() {
        isRecording = false
        recordingJob?.cancel()
        recordingJob = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (e: Exception) {}
        audioRecord = null
    }

    fun startPlayback(scope: CoroutineScope) {
        if (isPlaying) return

        try {
            val sampleRate = 24000
            val channelConfig = AudioFormat.CHANNEL_OUT_MONO
            val audioFormat = AudioFormat.ENCODING_PCM_16BIT
            val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, audioFormat).coerceAtLeast(4800)

            // Use USAGE_MEDIA (STREAM_MUSIC) for maximum loudspeaker volume (same as Bilibili/media players)
            audioTrack = AudioTrack.Builder()
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                )
                .setAudioFormat(
                    AudioFormat.Builder()
                        .setEncoding(audioFormat)
                        .setSampleRate(sampleRate)
                        .setChannelMask(channelConfig)
                        .build()
                )
                .setBufferSizeInBytes(minBufferSize)
                .setTransferMode(AudioTrack.MODE_STREAM)
                .build()

            if (audioTrack?.state == AudioTrack.STATE_INITIALIZED) {
                audioTrack?.play()
                isPlaying = true

                playbackJob = scope.launch(Dispatchers.IO) {
                    while (isActive && isPlaying) {
                        try {
                            val chunk = audioPlaybackQueue.take()
                            isAiSpeaking = true
                            synchronized(trackLock) {
                                if (isPlaying) {
                                    audioTrack?.write(chunk, 0, chunk.size)
                                }
                            }
                        } catch (e: InterruptedException) {
                            break
                        } catch (e: Exception) {
                            Log.w(TAG, "Error writing to AudioTrack", e)
                        }
                    }
                }
            } else {
                Log.e(TAG, "AudioTrack failed to initialize")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error starting AudioTrack playback", e)
        }
    }

    /**
     * Boost 16-bit PCM volume by a linear factor with saturation protection.
     */
    private fun applyPcmGain(pcmBytes: ByteArray, gain: Float = PCM_GAIN_FACTOR): ByteArray {
        val boosted = ByteArray(pcmBytes.size)
        val sampleCount = pcmBytes.size / 2
        for (i in 0 until sampleCount) {
            val low = pcmBytes[i * 2].toInt() and 0xFF
            val high = pcmBytes[i * 2 + 1].toInt()
            val sample = (high shl 8) or low
            var amplified = (sample * gain).toInt()
            if (amplified > 32767) amplified = 32767
            if (amplified < -32768) amplified = -32768
            boosted[i * 2] = (amplified and 0xFF).toByte()
            boosted[i * 2 + 1] = ((amplified shr 8) and 0xFF).toByte()
        }
        return boosted
    }

    fun enqueueAudioDelta(pcmChunk: ByteArray) {
        if (isPlaying) {
            val amplifiedChunk = applyPcmGain(pcmChunk)
            audioPlaybackQueue.offer(amplifiedChunk)
        }
    }

    /**
     * Safely clears pending audio and halts playback only if AI was currently speaking.
     * Avoids AudioTrack flush/pause crashes when called while idle.
     */
    fun stopPlayback() {
        audioPlaybackQueue.clear()
        synchronized(trackLock) {
            val wasSpeaking = isAiSpeaking
            isAiSpeaking = false
            if (wasSpeaking && isPlaying) {
                try {
                    audioTrack?.pause()
                    audioTrack?.flush()
                    audioTrack?.play()
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping playback", e)
                }
            }
        }
    }

    fun releasePlayback() {
        isPlaying = false
        isAiSpeaking = false
        playbackJob?.cancel()
        playbackJob = null
        audioPlaybackQueue.clear()
        synchronized(trackLock) {
            try {
                audioTrack?.stop()
                audioTrack?.release()
            } catch (e: Exception) {}
            audioTrack = null
        }
    }

    fun releaseAll() {
        stopRecording()
        releasePlayback()
    }
}
