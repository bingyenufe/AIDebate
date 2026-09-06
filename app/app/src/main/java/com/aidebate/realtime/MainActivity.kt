package com.aidebate.realtime

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import com.aidebate.realtime.databinding.ActivityMainBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel

class MainActivity : AppCompatActivity(), RealtimeListener {

    private lateinit var binding: ActivityMainBinding
    private lateinit var prefs: SharedPreferences

    private val audioManager = AudioStreamManager()
    private lateinit var realtimeClient: RealtimeAudioClient
    private var callScope: CoroutineScope? = null

    private var currentRole = "socrates"
    private var isConnected = false
    private var isMuted = false

    companion object {
        private const val REQ_CODE_PERMISSIONS = 1001
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
        setupBackPressInterceptor()
        updateRoleUI()

        // Check if API key is already configured
        val savedKey = prefs.getString(KEY_API_KEY, "")
        if (savedKey.isNullOrBlank()) {
            showSettingsDialog(isFirstTime = true)
        }
    }

    private fun setupBackPressInterceptor() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (isConnected) {
                    // Prevent accidental gesture/back button from destroying call
                    moveTaskToBack(true)
                    Toast.makeText(
                        this@MainActivity,
                        "通话在后台保持进行中。如需退出请点击【挂断通话】按钮",
                        Toast.LENGTH_SHORT
                    ).show()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        if (intent?.action == RealtimeForegroundService.ACTION_HANGUP) {
            endCall()
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
                binding.tvRoleDesc.text = "🏛️ 古希腊哲学家苏格拉底。通过产婆术追问帮助审视核心前提与漏洞，每次反问控制在 30 字以内；论证自洽时停止追问并做终结总结。纯语音作答。"
            }
            "opponent" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "⚔️ 学术反方辩友。学术交锋集中反驳关键论据，控制在 50 字以内；论据充分时坦诚承认局部合理性，达成共识后宣告辩论结束。纯语音作答。"
            }
            "collaborator" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🤝 学术研讨伙伴。不迎合不挑刺，澄清概念并启发机制推演，控制在 50 字以内；机制推导完善时简短概括核心结论友好结束。纯语音研讨。"
            }
            "first_grade" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🎒 一年级温柔助教。平缓温和引导思考，控制在 45 字以内；答对后表扬并宣布通关结束，不再反复纠缠。纯语音作答。"
            }
            "whys" -> {
                binding.customRoleCard.visibility = View.GONE
                binding.tvRoleDesc.text = "🌟 十万个为什么。平缓温和，用童趣生活比喻解释自然科学秘密，控制在 30 字以内。纯语音生动讲解。"
            }
            "custom" -> {
                binding.customRoleCard.visibility = View.VISIBLE
                if (binding.etCustomDuration.text.isNullOrBlank()) {
                    binding.etCustomDuration.setText("12")
                }
                binding.tvRoleDesc.text = "✏️ 自定义角色：请输入提示词界定角色，默认期望时长 12 秒，将按字数规范口语篇幅。"
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
                callScope?.let { scope ->
                    audioManager.startRecording(scope) { chunk ->
                        realtimeClient.sendAudioChunk(chunk)
                    }
                }
            }
        }
    }

    private fun checkPermissionAndStartCall() {
        val permissions = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
        val ungranted = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (ungranted.isNotEmpty()) {
            ActivityCompat.requestPermissions(
                this,
                ungranted.toTypedArray(),
                REQ_CODE_PERMISSIONS
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
                binding.etCustomDuration.setText("12")
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
        // DashScope Qwen3.5-Omni Realtime valid voices: Tina (default warm female), Ethan (energetic male)
        val voice = when (currentRole) {
            "socrates", "opponent" -> "Ethan"
            else -> "Tina"
        }

        realtimeClient.connect(apiKey, prompt, voice)
    }

    private fun buildRolePrompt(): String {
        return when (currentRole) {
            "socrates" -> """
                你是古希腊哲学家苏格拉底。
                【执行规则】：
                1. 你的任务是通过追问帮助学生审视观点前提与逻辑漏洞，绝不直接给出答案。
                2. 聚焦学生观点中的核心逻辑漏洞，每次只提出一个核心反问。用一两句表达清楚，字数控制在 30 字以内。
                3. 当学生的论证已逻辑自洽、前提清晰时，停止追问，给予肯定并做一句终结。
                4. 纯音频口语交流，像面对面即时交锋，精炼聚焦，默认不输出文本。
            """.trimIndent()
            "opponent" -> """
                你是一位辩论赛中立场坚定的学术反方辩友。
                【执行规则】：
                1. 持相反立场展开学术交锋，从学术角度提出核心反驳论据。
                2. 语气坚定严谨、尊重对手，集中火力反驳 1 个关键论据。用两三句表达清楚，字数控制在 50 字以内。
                3. 若用户论据充分严密，你必须坦诚承认其局部合理性并调整立场。
                4. 若核心分歧已澄清或达成共识，直接进行一句总结并宣告辩论结束。
                5. 纯音频口语作答，像面对面对辩一样干脆紧凑，默认不输出文本。
            """.trimIndent()
            "collaborator" -> """
                你是理性客观的学术研讨伙伴。
                【执行规则】：
                1. 不迎合、不挑刺，帮助澄清概念、补充前置假设并提出建构式启发问题。
                2. 精炼直接，像面对面学术讨论一样紧凑。每次集中讨论一个点，用两三句表达清楚，字数控制在 50 字以内。
                3. 当该问题的机制推导已基本完善通顺时，简短概括核心结论并友好结束研讨。
                4. 纯音频口语交流，默认不输出文本。
            """.trimIndent()
            "first_grade" -> """
                你是专为 6 岁一年级小朋友设计的温柔助教。
                【执行规则】：
                1. 必须平缓温和、不可太快，保证小朋友跟得上。
                2. 引导学生自己思考得出答案。不可直接给答案。
                3. 保证回答深入浅出，可以使用一些生动有趣的生活小比喻。
                4. 每次你回答只能表达一个观点，长度控制在两三句，字数控制在 45 字以内。
                5. 一旦小朋友答对了，给予表扬并宣布本题通关结束，不可反复纠缠。
                6. 纯音频生动讲解，默认不输出文本。
            """.trimIndent()
            "whys" -> """
                你是面向 6 岁小朋友的“十万个为什么”趣味科普助手。
                【执行规则】：
                1. 必须平缓温和、不可太快，保证小朋友跟得上。
                2. 用生动有趣的生活小比喻解释身边的自然科学秘密，严禁使用任何抽象深奥的科学术语。
                3. 每次你回答只能表达一个观点，长度控制在一两句，字数控制在 30 字以内。
                4. 适当给予鼓励/表扬，但不可每句话都含鼓励/表扬。
                5. 纯音频生动讲解，默认不输出文本。
            """.trimIndent()
            else -> {
                // Custom Role: user can input either a pure role prompt or copy from debug tool
                val userPrompt = binding.etCustomPrompt.text.toString().trim()
                    .ifBlank { "你是一位知识渊博、耐心友善的对话伙伴。" }
                val durationSec = binding.etCustomDuration.text.toString().trim().toIntOrNull() ?: 12

                // If user wrote complete prompt with rules/word limits, use verbatim
                if (userPrompt.contains("字以内") || userPrompt.contains("执行规则")) {
                    userPrompt
                } else {
                    val estWords = (durationSec * 3.8).toInt()
                    """
                    $userPrompt
                    【执行规则】：
                    1. 每次你回答只能表达一个观点，长度控制在两三句，字数控制在 $estWords 字以内。
                    2. 纯音频口语交流，默认不输出文本。
                    """.trimIndent()
                }
            }
        }
    }

    private fun endCall(preserveStatusText: Boolean = false) {
        RealtimeForegroundService.stop(this)
        callScope?.cancel()
        callScope = null

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
        if (requestCode == REQ_CODE_PERMISSIONS) {
            val audioGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            if (audioGranted) {
                startCall()
            } else {
                Toast.makeText(this, "需要麦克风权限以进行语音通话", Toast.LENGTH_LONG).show()
            }
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

            // Start foreground service for background keepalive
            RealtimeForegroundService.start(this@MainActivity)

            // Start Audio Record & Playback on independent callScope
            callScope?.cancel()
            val scope = CoroutineScope(Dispatchers.Default + SupervisorJob())
            callScope = scope

            audioManager.startPlayback(scope)
            audioManager.startRecording(scope) { chunk ->
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
