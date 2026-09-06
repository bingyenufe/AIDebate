// Realtime Prompt Debugger - Client App
// Handles 16kHz PCM Audio Capture, 24kHz PCM Playback, Timing & Metrics, WebSocket proxy connection

const ROLE_PRESETS = {
  socrates: `你是古希腊哲学家苏格拉底。
【执行规则】：
1. 你的任务是通过追问帮助学生审视观点前提与逻辑漏洞，绝不直接给出答案。
2. 聚焦学生观点中的核心逻辑漏洞，每次只提出一个核心反问。用一两句表达清楚，字数控制在 30 字以内。
3. 纯音频口语交流，像面对面即时交锋，精炼聚焦，默认不输出文本。`,

  opponent: `你是一位辩论赛中立场坚定的学术反方辩友。
【执行规则】：
1. 持相反立场展开学术交锋，从学术角度提出核心反驳论据。
2. 语气坚定严谨、尊重对手，集中火力反驳 1 个关键论据。用两三句表达清楚，字数控制在 50 字以内。
3. 纯音频口语作答，像面对面对辩一样干脆紧凑，默认不输出文本。`,

  collaborator: `你是理性客观的学术研讨伙伴。
【执行规则】：
1. 不迎合、不挑刺，帮助澄清概念、补充前置假设并提出建构式启发问题。
2. 精炼直接，像面对面学术讨论一样紧凑。每次集中讨论一个点，用两三句表达清楚，字数控制在 50 字以内。
3. 纯音频口语交流，默认不输出文本。`,

  first_grade: `你是专为 6 岁一年级小朋友设计的温柔助教。
【执行规则】：
1. 必须平缓温和、不可太快，保证小朋友跟得上。
2. 采用引导式教学：引导学生自己思考、得出答案。不可直接给出正确答案。
3. 保证回答深入浅出，可以使用一些生动有趣的生活小比喻。
4. 每次你回复只能表达一个观点，长度控制在两三句，字数控制在 45 字以内。
5. 纯音频生动讲解，默认不输出文本。`,

  whys: `你是面向 6 岁小朋友的“十万个为什么”趣味科普助手。
【执行规则】：
1. 必须平缓温和、不可太快，保证小朋友跟得上。
2. 用生动有趣的生活小比喻解释身边的自然科学秘密，严禁使用任何抽象深奥的科学术语。
3. 每次你回复只能表达一个观点，长度控制在一两句，字数控制在 30 字以内。
4. 适当给予鼓励/表扬，但不可每句话都含鼓励/表扬。
5. 纯音频生动讲解，默认不输出文本。`,

  custom: `请输入提示词界定角色`
};

class RealtimeDebuggerApp {
  constructor() {
    this.currentRole = 'socrates';
    this.isConnected = false;
    this.isMuted = false;
    this.ws = null;

    // Audio Capture & Playback
    this.audioInputCtx = null;
    this.audioOutputCtx = null;
    this.mediaStream = null;
    this.audioProcessor = null;
    this.scheduledTime = 0;
    this.activeAudioSources = [];

    // Stopwatch & Metrics
    this.aiSpeakingStartTime = 0;
    this.stopwatchTimer = null;
    this.currentAiText = '';
    this.lastAiDuration = 0;

    this.initElements();
    this.initEvents();
    this.loadSavedSettings();
    this.selectRole('socrates');
  }

  initElements() {
    this.elApiKey = document.getElementById('apiKey');
    this.btnToggleKey = document.getElementById('btnToggleKeyVisibility');
    this.connBadge = document.getElementById('connBadge');
    this.roleChips = document.getElementById('roleChips');
    this.promptEditor = document.getElementById('promptEditor');
    this.promptCharCount = document.getElementById('promptCharCount');
    this.btnResetPrompt = document.getElementById('btnResetPrompt');

    this.inputDuration = document.getElementById('inputDuration');
    this.voiceSelect = document.getElementById('voiceSelect');
    this.btnExportKotlin = document.getElementById('btnExportKotlin');

    this.btnToggleCall = document.getElementById('btnToggleCall');
    this.btnMute = document.getElementById('btnMute');
    this.visualizerEmoji = document.getElementById('visualizerEmoji');
    this.callLiveStatus = document.getElementById('callLiveStatus');
    this.audioBar = document.getElementById('audioBar');

    this.valDuration = document.getElementById('valDuration');
    this.valDurationTarget = document.getElementById('valDurationTarget');
    this.valWordCount = document.getElementById('valWordCount');
    this.valWordEstimate = document.getElementById('valWordEstimate');
    this.valSpeed = document.getElementById('valSpeed');
    this.valEvaluation = document.getElementById('valEvaluation');
    this.valEvalDetail = document.getElementById('valEvalDetail');

    this.transcriptContent = document.getElementById('transcriptContent');
    this.btnClearLog = document.getElementById('btnClearLog');
    this.toastEl = document.getElementById('toast');
  }

  initEvents() {
    // API Key save on blur
    this.elApiKey.addEventListener('change', () => {
      localStorage.setItem('dashscope_api_key', this.elApiKey.value.trim());
      this.showToast('API Key 已保存在本地浏览器中');
    });

    // Toggle API Key visibility
    this.btnToggleKey.addEventListener('click', () => {
      this.elApiKey.type = this.elApiKey.type === 'password' ? 'text' : 'password';
    });

    // Role selection chips
    this.roleChips.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this.selectRole(chip.dataset.role);
      });
    });

    // Prompt editor changes
    this.promptEditor.addEventListener('input', () => {
      this.promptCharCount.textContent = `${this.promptEditor.value.length} 字`;
    });

    // Reset prompt button
    this.btnResetPrompt.addEventListener('click', () => {
      this.promptEditor.value = ROLE_PRESETS[this.currentRole] || '';
      this.promptCharCount.textContent = `${this.promptEditor.value.length} 字`;
      this.showToast('已恢复预设提示词');
    });

    // Duration input update estimates
    this.inputDuration.addEventListener('input', () => {
      this.updateDurationEstimates();
    });

    // Export Kotlin code
    this.btnExportKotlin.addEventListener('click', () => {
      this.exportKotlinCode();
    });

    // Toggle Call button
    this.btnToggleCall.addEventListener('click', () => {
      if (!this.isConnected) {
        this.startCall();
      } else {
        this.endCall();
      }
    });

    // Mute button
    this.btnMute.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      this.btnMute.textContent = this.isMuted ? '🔇 麦克风已关' : '🎙️ 麦克风已开';
      this.showToast(this.isMuted ? '麦克风已静音' : '麦克风已开启');
    });

    // Clear transcript
    this.btnClearLog.addEventListener('click', () => {
      this.transcriptContent.innerHTML = '<div class="empty-hint">记录已清空。随时说话测试...</div>';
    });
  }

  loadSavedSettings() {
    const savedKey = localStorage.getItem('dashscope_api_key');
    if (savedKey) {
      this.elApiKey.value = savedKey;
    }
    this.updateDurationEstimates();
  }

  selectRole(role) {
    this.currentRole = role;
    this.roleChips.querySelectorAll('.chip').forEach(c => {
      c.classList.toggle('active', c.dataset.role === role);
    });

    this.promptEditor.value = ROLE_PRESETS[role] || '';
    this.promptCharCount.textContent = `${this.promptEditor.value.length} 字`;

    // Role-specific voice and duration based on user tuning
    if (role === 'socrates') {
      this.voiceSelect.value = 'Ethan';
      this.inputDuration.value = 8;
    } else if (role === 'opponent') {
      this.voiceSelect.value = 'Ethan';
      this.inputDuration.value = 12;
    } else if (role === 'collaborator') {
      this.voiceSelect.value = 'Tina';
      this.inputDuration.value = 12;
    } else if (role === 'first_grade') {
      this.voiceSelect.value = 'Tina';
      this.inputDuration.value = 12;
    } else if (role === 'whys') {
      this.voiceSelect.value = 'Tina';
      this.inputDuration.value = 8;
    } else {
      // custom role
      this.voiceSelect.value = 'Tina';
      this.inputDuration.value = 12;
    }
    this.updateDurationEstimates();
  }

  updateDurationEstimates() {
    const sec = parseInt(this.inputDuration.value, 10) || 10;
    this.valDurationTarget.textContent = `目标: ${sec} 秒`;

    // Match word limit directly from the prompt text
    const match = this.promptEditor.value.match(/字数控制在\s*(\d+)\s*字以内/);
    if (match) {
      this.valWordEstimate.textContent = `提示词约束上限: ${match[1]} 字`;
    } else {
      const estWords = Math.round(sec * 3.8);
      this.valWordEstimate.textContent = `预估字数: ~${estWords} 字`;
    }
  }

  buildFinalInstructions() {
    // Return pure prompt exactly as tuned by user (no extra injection)
    return this.promptEditor.value.trim();
  }

  async startCall() {
    const apiKey = this.elApiKey.value.trim();
    if (!apiKey) {
      this.showToast('请先输入您的 DashScope API Key (sk-...)');
      this.elApiKey.focus();
      return;
    }

    this.updateConnBadge('connecting', '🟡 正在连接...');
    this.callLiveStatus.textContent = '正在通过本地代理建立与阿里云百炼的长连接...';
    this.btnToggleCall.disabled = true;

    try {
      // Connect to local python proxy (ws://127.0.0.1:8766)
      const wsUrl = `ws://127.0.0.1:8766/?apiKey=${encodeURIComponent(apiKey)}`;
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected to local proxy');
      };

      this.ws.onmessage = (event) => {
        this.handleServerMessage(event.data);
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        this.handleCallError('无法连接到本地代理服务，请确保已运行 run.bat 或 server.py');
      };

      this.ws.onclose = (event) => {
        console.log('[WebSocket] Closed:', event.code, event.reason);
        if (this.isConnected) {
          this.endCall();
        }
      };
    } catch (e) {
      this.handleCallError(`启动失败: ${e.message}`);
    }
  }

  async onProxyReady() {
    console.log('[App] Proxy connected to DashScope. Initializing session...');
    this.isConnected = true;
    this.updateConnBadge('connected', '🟢 已连接百炼');
    this.btnToggleCall.disabled = false;
    this.btnToggleCall.textContent = '🔴 结束实时通话';
    this.btnToggleCall.classList.add('btn-hangup');
    this.btnMute.style.display = 'inline-block';
    this.callLiveStatus.textContent = '🟢 实时语音已通，请对麦克风说话...';
    this.visualizerEmoji.textContent = '🟢';

    // Send Session Update with active prompt and voice
    const voice = this.voiceSelect.value || 'Tina';
    const instructions = this.buildFinalInstructions();

    const sessionUpdateEvent = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: instructions,
        voice: voice,
        input_audio_format: 'pcm',
        output_audio_format: 'pcm',
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          silence_duration_ms: 800
        }
      }
    };
    this.ws.send(JSON.stringify(sessionUpdateEvent));
    console.log('[App] Sent session.update with voice:', voice);

    // Initialize Audio Capture & Playback
    await this.initAudio();
  }

  async initAudio() {
    // 1. Audio Output Context (24kHz)
    if (!this.audioOutputCtx || this.audioOutputCtx.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioOutputCtx = new AudioContext({ sampleRate: 24000 });
    }
    if (this.audioOutputCtx.state === 'suspended') {
      await this.audioOutputCtx.resume();
    }
    this.scheduledTime = this.audioOutputCtx.currentTime;

    // 2. Audio Input Context (16kHz recording)
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioInputCtx = new AudioContext({ sampleRate: 16000 });
      const source = this.audioInputCtx.createMediaStreamSource(this.mediaStream);

      // Simple volume analyzer
      const analyser = this.audioInputCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);

      // ScriptProcessor for 16-bit PCM streaming (bufferSize 2048 = ~128ms)
      const bufferSize = 2048;
      this.audioProcessor = this.audioInputCtx.createScriptProcessor(bufferSize, 1, 1);

      const pcmDataBuffer = [];
      const volumeData = new Uint8Array(analyser.frequencyBinCount);

      this.audioProcessor.onaudioprocess = (e) => {
        if (!this.isConnected || this.isMuted) return;

        // Visualizer meter
        analyser.getByteFrequencyData(volumeData);
        let sum = 0;
        for (let i = 0; i < volumeData.length; i++) sum += volumeData[i];
        const avg = sum / volumeData.length;
        this.audioBar.style.width = `${Math.min(100, avg * 2)}%`;

        // Convert Float32 to Int16 PCM
        const inputData = e.inputBuffer.getChannelData(0);
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]));
          pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        // Encode to base64 and send
        const pcmBytes = new Uint8Array(pcm16.buffer);
        const base64Audio = this.uint8ToBase64(pcmBytes);

        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'input_audio_buffer.append',
            audio: base64Audio
          }));
        }
      };

      source.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioInputCtx.destination);

    } catch (e) {
      this.showToast(`无法开启麦克风: ${e.message}`);
      console.error(e);
    }
  }

  handleServerMessage(rawText) {
    try {
      const msg = JSON.parse(rawText);
      const type = msg.type;

      if (type === 'proxy.ready') {
        this.onProxyReady();
        return;
      }

      if (type === 'error') {
        const errorDetail = msg.error ? (msg.error.message || JSON.stringify(msg.error)) : rawText;
        this.handleCallError(`百炼报错: ${errorDetail}`);
        return;
      }

      switch (type) {
        case 'session.created':
          console.log('[Server] session.created');
          break;

        case 'session.updated':
          console.log('[Server] session.updated successfully');
          break;

        case 'input_audio_buffer.speech_started':
          console.log('[Server] User speaking detected (barge-in)');
          this.visualizerEmoji.textContent = '🎙️';
          this.callLiveStatus.textContent = '正在倾听您说话...';
          this.updateConnBadge('speaking', '🎙️ 用户说话中');
          this.stopAiPlayback(); // Instant barge-in interruption
          break;

        case 'input_audio_buffer.speech_stopped':
          console.log('[Server] User speech stopped');
          this.callLiveStatus.textContent = '正在思考并组织回答...';
          break;

        case 'response.audio.delta':
          if (msg.delta) {
            this.onAiStartedSpeaking();
            this.queueAudioDelta(msg.delta);
          }
          break;

        case 'response.audio_transcript.delta':
          if (msg.delta) {
            this.appendAiTranscriptDelta(msg.delta);
          }
          break;

        case 'response.text.delta':
          if (msg.delta) {
            this.appendAiTranscriptDelta(msg.delta);
          }
          break;

        case 'response.audio.done':
        case 'response.done':
          this.onAiFinishedSpeaking();
          break;
      }
    } catch (e) {
      console.warn('[Server] Parse error:', e, rawText);
    }
  }

  onAiStartedSpeaking() {
    if (!this.aiSpeakingStartTime) {
      this.aiSpeakingStartTime = performance.now();
      this.currentAiText = '';
      this.visualizerEmoji.textContent = '🔊';
      this.callLiveStatus.textContent = 'AI 正在回答中...';
      this.updateConnBadge('speaking', '🔊 AI 正在回答');

      // Start stopwatch
      if (this.stopwatchTimer) clearInterval(this.stopwatchTimer);
      this.stopwatchTimer = setInterval(() => {
        const elapsedSec = ((performance.now() - this.aiSpeakingStartTime) / 1000).toFixed(1);
        this.valDuration.innerHTML = `${elapsedSec} <span class="unit">秒</span>`;
      }, 50);

      // Create new chat bubble
      this.currentAiBubble = document.createElement('div');
      this.currentAiBubble.className = 'chat-bubble bubble-ai';
      this.currentAiBubble.textContent = 'AI: ';

      // Clear empty hint if present
      const emptyHint = this.transcriptContent.querySelector('.empty-hint');
      if (emptyHint) emptyHint.remove();

      this.transcriptContent.appendChild(this.currentAiBubble);
      this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }
  }

  appendAiTranscriptDelta(deltaText) {
    this.currentAiText += deltaText;
    if (this.currentAiBubble) {
      this.currentAiBubble.textContent = `AI: ${this.currentAiText}`;
      this.transcriptContent.scrollTop = this.transcriptContent.scrollHeight;
    }

    // Update real-time word count
    const words = this.countChineseWords(this.currentAiText);
    this.valWordCount.innerHTML = `${words} <span class="unit">字</span>`;
  }

  onAiFinishedSpeaking() {
    if (this.aiSpeakingStartTime) {
      const elapsedSec = ((performance.now() - this.aiSpeakingStartTime) / 1000);
      this.lastAiDuration = elapsedSec;
      clearInterval(this.stopwatchTimer);
      this.stopwatchTimer = null;
      this.aiSpeakingStartTime = 0;

      this.valDuration.innerHTML = `${elapsedSec.toFixed(1)} <span class="unit">秒</span>`;

      // Word count & speed
      const words = this.countChineseWords(this.currentAiText);
      this.valWordCount.innerHTML = `${words} <span class="unit">字</span>`;
      const speed = elapsedSec > 0.3 ? (words / elapsedSec).toFixed(1) : '0.0';
      this.valSpeed.innerHTML = `${speed} <span class="unit">字/秒</span>`;

      // Evaluate compliance vs target duration
      const targetSec = parseInt(this.inputDuration.value, 10) || 10;
      const diff = elapsedSec - targetSec;

      if (diff > 3) {
        this.valEvaluation.textContent = `⚠️ 超标 +${diff.toFixed(1)}s`;
        this.valEvaluation.className = 'metric-value-tag tag-over';
        this.valEvalDetail.textContent = '建议开启“字数硬刹车”或进一步压低字数上限';
      } else if (diff < -5 && targetSec > 8) {
        this.valEvaluation.textContent = `⚠️ 偏短 ${diff.toFixed(1)}s`;
        this.valEvaluation.className = 'metric-value-tag tag-idle';
        this.valEvalDetail.textContent = '回答较为简练';
      } else {
        this.valEvaluation.textContent = '✅ 达标 (符合预期)';
        this.valEvaluation.className = 'metric-value-tag tag-pass';
        this.valEvalDetail.textContent = `与 ${targetSec} 秒目标高度吻合！`;
      }

      this.visualizerEmoji.textContent = '🟢';
      this.callLiveStatus.textContent = 'AI 回答完毕。随时说话继续对辩...';
      this.updateConnBadge('connected', '🟢 连麦中');
    }
  }

  queueAudioDelta(base64Pcm) {
    if (!this.audioOutputCtx) return;

    try {
      const pcmBytes = this.base64ToUint8(base64Pcm);
      const int16Array = new Int16Array(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength / 2);

      // Convert Int16 to Float32
      const float32 = new Float32Array(int16Array.length);
      for (let i = 0; i < int16Array.length; i++) {
        float32[i] = int16Array[i] / 32768.0;
      }

      // Create AudioBuffer at 24000Hz
      const audioBuffer = this.audioOutputCtx.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.audioOutputCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.audioOutputCtx.destination);

      const currentTime = this.audioOutputCtx.currentTime;
      if (this.scheduledTime < currentTime) {
        this.scheduledTime = currentTime;
      }

      source.start(this.scheduledTime);
      this.scheduledTime += audioBuffer.duration;
      this.activeAudioSources.push(source);

      source.onended = () => {
        const idx = this.activeAudioSources.indexOf(source);
        if (idx !== -1) this.activeAudioSources.splice(idx, 1);
      };

    } catch (e) {
      console.warn('[Audio] Decode error:', e);
    }
  }

  stopAiPlayback() {
    // Stop all playing audio chunks immediately
    this.activeAudioSources.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    this.activeAudioSources = [];
    if (this.audioOutputCtx) {
      this.scheduledTime = this.audioOutputCtx.currentTime;
    }
  }

  handleCallError(errMsg) {
    this.showToast(errMsg);
    this.updateConnBadge('error', '❌ 连接异常');
    this.callLiveStatus.textContent = `❌ ${errMsg}`;
    this.endCall();
  }

  endCall() {
    this.isConnected = false;
    this.btnToggleCall.disabled = false;
    this.btnToggleCall.textContent = '📞 开启实时连麦通话';
    this.btnToggleCall.classList.remove('btn-hangup');
    this.btnMute.style.display = 'none';
    this.visualizerEmoji.textContent = '🎙️';
    this.audioBar.style.width = '0%';
    this.updateConnBadge('idle', '🔴 未连接');

    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.audioProcessor) {
      try { this.audioProcessor.disconnect(); } catch (e) {}
      this.audioProcessor = null;
    }

    this.stopAiPlayback();
    if (this.stopwatchTimer) {
      clearInterval(this.stopwatchTimer);
      this.stopwatchTimer = null;
    }
  }

  updateConnBadge(state, text) {
    this.connBadge.className = `badge badge-${state}`;
    this.connBadge.textContent = text;
  }

  countChineseWords(str) {
    if (!str) return 0;
    // Count CJK characters + English words
    const cjk = (str.match(/[\u4e00-\u9fa5]/g) || []).length;
    const en = (str.match(/[a-zA-Z0-9]+/g) || []).length;
    return cjk + en;
  }

  exportKotlinCode() {
    const finalInstructions = this.buildFinalInstructions();
    const durationSec = parseInt(this.inputDuration.value, 10) || 10;
    const voice = this.voiceSelect.value;

    const kotlinSnippet = `
// ==========================================
// 调试台优化后的提示词配置 (角色: ${this.currentRole})
// 目标时长: ${durationSec} 秒 | 音色: "${voice}"
// ==========================================

"""
${finalInstructions}
""".trimIndent()
`.trim();

    navigator.clipboard.writeText(kotlinSnippet).then(() => {
      this.showToast('✅ 已复制优化提示词的 Kotlin 代码到剪贴板！');
    }).catch(() => {
      // Fallback
      prompt('请复制以下 Kotlin 提示词代码：', kotlinSnippet);
    });
  }

  uint8ToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  base64ToUint8(base64) {
    const binary = window.atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  showToast(msg) {
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 3500);
  }
}

// Initialize on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new RealtimeDebuggerApp();
});
