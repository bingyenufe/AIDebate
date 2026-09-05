package com.aidebate.realtime

import android.annotation.SuppressLint
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.util.concurrent.LinkedBlockingQueue

/**
 * AudioStreamManager handles low-latency mic recording (16kHz PCM)
 * and real-time audio playback (24kHz PCM) for Alibaba Cloud Realtime API.
 */
class AudioStreamManager {

    private var audioRecord: AudioRecord? = null
    private var audioTrack: AudioTrack? = null

    private var recordingJob: Job? = null
    private var playbackJob: Job? = null

    private val audioPlaybackQueue = LinkedBlockingQueue<ByteArray>()

    @Volatile
    private var isRecording = false

    @Volatile
    private var isPlaying = false

    @SuppressLint("MissingPermission")
    fun startRecording(scope: CoroutineScope, onAudioChunk: (ByteArray) -> Unit) {
        if (isRecording) return

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
    }

    fun stopRecording() {
        isRecording = false
        recordingJob?.cancel()
        recordingJob = null
        try {
            audioRecord?.stop()
            audioRecord?.release()
        } catch (_: Exception) {}
        audioRecord = null
    }

    fun startPlayback(scope: CoroutineScope) {
        if (isPlaying) return

        val sampleRate = 24000
        val channelConfig = AudioFormat.CHANNEL_OUT_MONO
        val audioFormat = AudioFormat.ENCODING_PCM_16BIT
        val minBufferSize = AudioTrack.getMinBufferSize(sampleRate, channelConfig, audioFormat).coerceAtLeast(4800)

        audioTrack = AudioTrack.Builder()
            .setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
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

        audioTrack?.play()
        isPlaying = true

        playbackJob = scope.launch(Dispatchers.IO) {
            while (isActive && isPlaying) {
                try {
                    val chunk = audioPlaybackQueue.take()
                    audioTrack?.write(chunk, 0, chunk.size)
                } catch (_: InterruptedException) {
                    break
                }
            }
        }
    }

    fun enqueueAudioDelta(pcmChunk: ByteArray) {
        if (isPlaying) {
            audioPlaybackQueue.offer(pcmChunk)
        }
    }

    /**
     * Instantly stops and clears playback when user starts speaking (Interruption / Barge-in)
     */
    fun stopPlayback() {
        audioPlaybackQueue.clear()
        try {
            audioTrack?.pause()
            audioTrack?.flush()
            audioTrack?.play()
        } catch (_: Exception) {}
    }

    fun releasePlayback() {
        isPlaying = false
        playbackJob?.cancel()
        playbackJob = null
        audioPlaybackQueue.clear()
        try {
            audioTrack?.stop()
            audioTrack?.release()
        } catch (_: Exception) {}
        audioTrack = null
    }

    fun releaseAll() {
        stopRecording()
        releasePlayback()
    }
}
