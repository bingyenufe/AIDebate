package com.aidebate.realtime

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.aidebate.realtime.databinding.ActivityMainBinding

class MainActivity : AppCompatActivity(), RealtimeListener {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences

    private val audioManager = AudioStreamManager()
    private lateinit var realtimeClient: RealtimeAudioClient

    private var currentRole = "socrates"
    private var isConnected = false
    private var isMuted = false

    companion object {
        private const val REQ_CODE_RECORD_AUDIO = 1001
        private const val PREFS_NAME = "realtime_debate_prefs"
        private const val KEY_API_KEY = "dashscope_api_key"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        realtimeClient = RealtimeAudioClient(this)

        setupRoleSelection()
        setupButtons()
        updateRoleUI()

        // Check if API key is already configured
        val savedKey = prefs.getString(KEY_API_KEY, "")
        if (savedKey.isNullOrBlank()) {
            showSettingsDialog(isFirstTime = true)
        }
    }

    private fun setupRoleSelection() {
        binding.roleChipGroup.setOnCheckedStateChangeListener { _, checkedIds ->
            if (checkedIds.isEmpty()) return@setOnCheckedStateChangeListener
            when (checkedIds.first()) {
                R.id.chipSocrates -> currentRole = "socrates"
                R.id.chipOpponent -> currentRole = "opponent"
                R.id.chipCollaborator -> currentRole = "collaborator"
                R.id.chipFirstGrade -> currentRole = "first_grade"
                R.id.chipWhys -> currentRole = "whys"
                R.id.chipCustom -> currentRole = "custom"
            }
            updateRoleUI()
        }
        binding.chipSocrates.isChecked = true
    }

    private fun updateRoleUI() {
        when (currentRole) {
            "socrates" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🏛️ 古希腊哲学家苏格拉底。通过产婆术追问帮助审视核心前提与逻辑漏洞，绝不直接给答案，每次提出一个核心反问。默认纯语音作答。"
            }
            "opponent" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "⚔️ 立场坚定的学术反方辩友。持相反学术立场展开对辩交锋，语气坚定严谨，集中火力反驳关键论据。默认纯语音作答。"
            }
            "collaborator" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🤝 理性客观的学术研讨伙伴。不迎合不挑刺，澄清概念、补充前置假设并启发机制推演（字数控制在100~150字左右）。默认纯语音研讨。"
            }
            "first_grade" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🎒 专为6岁一年级小朋友设计的温柔助教。语速平缓温和，引导拼音认读、识字与加减法，先答对再表扬，极其简短亲切。默认纯语音作答。"
            }
            "whys" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🌟 面向低年级小朋友的“十万个为什么”。语速平缓生动，用童趣生活小比喻解释身边的自然科学秘密，短小精炼。默认纯语音作答。"
            }
            "custom" -> {
                binding.customRoleCard.visibility = View.VISIBLE
                binding.tvRoleDesc.text = "✏️ 自定义角色：根据您设定的身份立场展开实时交流，单次回答时长严格按照窗口中输入的秒数执行。"
            }
        }
    }

    private fun setupButtons() {
        binding.btnSettings.setOnClickListener {
            showSettingsDialog(isFirstTime = false)
        }

        binding.btnToggleCall.setOnClickListener {
            if (!isConnected) {
                checkPermissionAndStartCall()
            } else {
                endCall()
            }
        }

        binding.btnMute.setOnClickListener {
            isMuted = !isMuted
            if (isMuted) {
                binding.btnMute.text = "🔇 麦克风已关"
                audioManager.stopRecording()
            } else {
                binding.btnMute.text = "🎙️ 麦克风已开"
                audioManager.startRecording(lifecycleScope) { chunk ->
                    realtimeClient.sendAudioChunk(chunk)
                }
            }
        }
    }

    private fun checkPermissionAndStartCall() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.RECORD_AUDIO),
                REQ_CODE_RECORD_AUDIO
            )
            return
        }
        startCall()
    }

    private fun startCall() {
        val apiKey = prefs.getString(KEY_API_KEY, "")?.trim() ?: ""
        if (apiKey.isBlank()) {
            Toast.makeText(this, "请先在右上角设置中填写您的 API Key", Toast.LENGTH_SHORT).show()
            showSettingsDialog(isFirstTime = true)
            return
        }

        if (currentRole == "custom") {
            val durationText = binding.etCustomDuration.text.toString().trim()
            if (durationText.isEmpty()) {
                Toast.makeText(this, "请在时长窗口中输入单次回答时长（秒）", Toast.LENGTH_SHORT).show()
                binding.etCustomDuration.requestFocus()
                return
            }
        }

        binding.tvConnStatus.text = getString(R.string.status_connecting)
        binding.tvLiveStatus.text = "正在连接阿里云百炼 Qwen-Omni 实时服务..."
        binding.btnToggleCall.isEnabled = false

        // Disable role switching while call is in progress
        for (i in 0 until binding.roleChipGroup.childCount) {
            binding.roleChipGroup.getChildAt(i).isEnabled = false
        }

        val prompt = buildRolePrompt()
        // DashScope Realtime valid voices: Ethan (male), Serena (female), Cherry (female), Chelsie (female)
        val voice = when (currentRole) {
            "socrates", "opponent" -> "Ethan"
            "collaborator" -> "Serena"
            "first_grade", "whys" -> "Cherry"
            else -> "Cherry"
        }

        realtimeClient.connect(apiKey, prompt, voice)
    }

    private fun buildRolePrompt(): String {
        return when (currentRole) {
            "socrates" -> """
                你是古希腊哲学家苏格拉底。
                【执行规则】：
                1. 你的任务是通过追问帮助学生审视观点前提与漏洞，绝不直接给出答案。
                2. 聚焦学生观点中的核心逻辑漏洞，每次只提出一个核心反问。
                3. 纯音频口语作答，像面对面即时口语交流，精炼聚焦，默认不输出文本。
            """.trimIndent()
            "opponent" -> """
                你是一位辩论赛中立场坚定的学术反方辩友。
                【执行规则】：
                1. 持相反立场展开学术交锋，从学术角度提出核心反驳论据。
                2. 语气坚定严谨、尊重对手，集中火力反驳 1 个关键论据。
                3. 纯音频口语作答，像面对面对辩一样干脆紧凑，默认不输出文本。
            """.trimIndent()
            "collaborator" -> """
                你是理性客观的学术研讨伙伴。
                【执行规则】：
                1. 不迎合、不挑刺，帮助澄清概念、补充前置假设并提出建构式启发问题。
                2. 精炼直接，像面对面学术讨论一样紧凑（字数严格控制在 100~150 字）。
                3. 纯音频口语交流，默认不输出文本。
            """.trimIndent()
            "first_grade" -> """
                你是专为 6 岁一年级小朋友设计的温柔助教。
                【执行规则】：
                1. 语速必须平缓温和、从容不迫、不可太快，充满耐心与鼓励。
                2. 回答时先直接、明确地给出正确答案，再用一句简单的生活记法或表扬收尾。
                3. 极其短小精炼，一气呵成，讲完即止（约 5~8 秒），纯音频亲切启发，默认不输出文本。
            """.trimIndent()
            "whys" -> """
                你是面向 6 岁小朋友的“十万个为什么”趣味科普助手。
                【执行规则】：
                1. 语速必须平缓温和、生动有趣，不可太快。
                2. 用生动有趣的生活小比喻解释身边的科学秘密，严禁使用任何抽象深奥的科学术语。
                3. 极短篇幅（约 6~10 秒），纯音频生动讲解，默认不输出文本。
            """.trimIndent()
            else -> {
                // Custom Role (duration entered by user, no brackets in prompt or UI)
                val userPrompt = binding.etCustomPrompt.text.toString().ifBlank { "你是一位知识渊博、耐心友善的对话伙伴。" }
                val durationSec = binding.etCustomDuration.text.toString().trim()
                """
                $userPrompt
                【时长与篇幅硬性约束】：
                用户要求你的每次语音回答时长严格控制在 $durationSec 秒左右！
                请严格按照 $durationSec 秒的时间把控语速与信息量，讲完即止，坚决不可拖沓超时！
                纯音频口语交流，默认不输出文本。
                """.trimIndent()
            }
        }
    }

    private fun endCall(preserveStatusText: Boolean = false) {
        realtimeClient.disconnect()
        audioManager.releaseAll()

        isConnected = false
        binding.tvConnStatus.text = getString(R.string.status_idle)
        if (!preserveStatusText) {
            binding.tvLiveStatus.text = "通话已结束。随时点击按钮重新开启对辩。"
        }
        binding.tvVisualizerEmoji.text = "🎙️"
        binding.btnToggleCall.text = getString(R.string.btn_start_call)
        binding.btnToggleCall.setBackgroundColor(ContextCompat.getColor(this, R.color.btn_call))
        binding.btnToggleCall.isEnabled = true
        binding.btnMute.visibility = View.GONE

        // Re-enable role selection
        for (i in 0 until binding.roleChipGroup.childCount) {
            binding.roleChipGroup.getChildAt(i).isEnabled = true
        }
    }

    private fun showSettingsDialog(isFirstTime: Boolean) {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_settings, null)
        val etApiKey = view.findViewById<EditText>(R.id.etApiKey)
        val currentKey = prefs.getString(KEY_API_KEY, "") ?: ""
        etApiKey.setText(currentKey)

        AlertDialog.Builder(this)
            .setView(view)
            .setCancelable(!isFirstTime)
            .setPositiveButton("保存并使用") { _, _ ->
                val newKey = etApiKey.text.toString().trim()
                if (newKey.isNotEmpty()) {
                    prefs.edit().putString(KEY_API_KEY, newKey).apply()
                    Toast.makeText(this, "API Key 已安全保存在手机本地", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton(if (isFirstTime) "稍后填写" else "取消", null)
            .show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_CODE_RECORD_AUDIO && grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            startCall()
        } else {
            Toast.makeText(this, "需要麦克风权限以进行语音通话", Toast.LENGTH_LONG).show()
        }
    }

    // RealtimeListener Callbacks
    override fun onConnected() {
        runOnUiThread {
            isConnected = true
            binding.tvConnStatus.text = getString(R.string.status_connected)
            binding.tvLiveStatus.text = "🟢 实时语音通话已接通，请直接对麦克风说话"
            binding.tvVisualizerEmoji.text = "🟢"
            binding.btnToggleCall.text = getString(R.string.btn_end_call)
            binding.btnToggleCall.setBackgroundColor(ContextCompat.getColor(this, R.color.btn_hangup))
            binding.btnToggleCall.isEnabled = true
            binding.btnMute.visibility = View.VISIBLE

            // Start Audio Record & Playback
            audioManager.startPlayback(lifecycleScope)
            audioManager.startRecording(lifecycleScope) { chunk ->
                if (!isMuted) {
                    realtimeClient.sendAudioChunk(chunk)
                }
            }
        }
    }

    override fun onDisconnected(reason: String) {
        runOnUiThread {
            if (reason.isNotBlank() && reason != "User ended call") {
                binding.tvLiveStatus.text = "通话断开: $reason"
                endCall(preserveStatusText = true)
            } else {
                endCall(preserveStatusText = false)
            }
        }
    }

    override fun onError(error: String) {
        runOnUiThread {
            Toast.makeText(this, error, Toast.LENGTH_LONG).show()
            binding.tvLiveStatus.text = "❌ $error"
            endCall(preserveStatusText = true)
        }
    }

    override fun onUserSpeaking() {
        runOnUiThread {
            binding.tvVisualizerEmoji.text = "🎙️"
            binding.tvLiveStatus.text = "正在倾听您说话..."
            // Instant barge-in: stop any playing AI audio
            audioManager.stopPlayback()
        }
    }

    override fun onAiSpeaking() {
        runOnUiThread {
            binding.tvVisualizerEmoji.text = "🔊"
            binding.tvLiveStatus.text = "AI 正在回答中..."
        }
    }

    override fun onAiFinishedSpeaking() {
        runOnUiThread {
            binding.tvVisualizerEmoji.text = "🟢"
            binding.tvLiveStatus.text = "AI 回答完毕，请随时说话..."
        }
    }

    override fun onAudioDeltaReceived(pcmBytes: ByteArray) {
        audioManager.enqueueAudioDelta(pcmBytes)
    }

    override fun onDestroy() {
        super.onDestroy()
        endCall()
    }
}
