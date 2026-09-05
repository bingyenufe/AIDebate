// Realtime AI Debate Client - Powered by Alibaba Cloud DashScope qwen3.5-omni-flash-realtime

let currentRole = 'first_grade_tutor'; // default role
let customRolePrompt = '';
let uploadedFileContent = '';
let uploadedImageBase64 = '';
let uploadedFileName = '';

let pc = null; // RTCPeerConnection
let dc = null; // RTCDataChannel
let localStream = null;
let isConnected = false;
let isMuted = false;

let audioContext = null;
let analyserNode = null;
let animFrameId = null;

// DOM Elements
const connStatusBadge = document.getElementById('connStatusBadge');
const connStatusText = document.getElementById('connStatusText');
const liveDot = document.getElementById('liveDot');
const chatRoleLabel = document.getElementById('chatRoleLabel');
const stageStatusText = document.getElementById('stageStatusText');
const audioWave = document.getElementById('audioWave');
const chatMessages = document.getElementById('chatMessages');
const remoteAudio = document.getElementById('remoteAudio');

const roleCards = document.querySelectorAll('.role-card');
const instructionTitle = document.getElementById('instructionTitle');
const instructionText = document.getElementById('instructionText');
const customRolePanel = document.getElementById('customRolePanel');
const customPromptInput = document.getElementById('customPromptInput');
const saveCustomRoleBtn = document.getElementById('saveCustomRoleBtn');

const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const cameraSnapBtn = document.getElementById('cameraSnapBtn');
const dropzone = document.getElementById('dropzone');
const uploadStatusText = document.getElementById('uploadStatusText');
const fileLoadedBadge = document.getElementById('fileLoadedBadge');
const fileBadgeName = document.getElementById('fileBadgeName');
const removeFileBtn = document.getElementById('removeFileBtn');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const imagePreview = document.getElementById('imagePreview');

const toggleCallBtn = document.getElementById('toggleCallBtn');
const toggleCallBtnText = document.getElementById('toggleCallBtnText');
const muteToggleBtn = document.getElementById('muteToggleBtn');
const muteIcon = document.getElementById('muteIcon');
const muteText = document.getElementById('muteText');
const hangupBtn = document.getElementById('hangupBtn');

const textInput = document.getElementById('textInput');
const sendTextBtn = document.getElementById('sendTextBtn');
const footerIcon = document.getElementById('footerIcon');
const footerText = document.getElementById('footerText');

// Password Modal DOM
const passwordModalOverlay = document.getElementById('passwordModalOverlay');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const passwordErrorTip = document.getElementById('passwordErrorTip');
const submitPasswordBtn = document.getElementById('submitPasswordBtn');

// Role Specifications & Prompts (Aligned with Realtime Voice Architecture)
const ROLE_CONFIGS = {
  first_grade_tutor: {
    name: '一年级学习助手',
    icon: '🎒',
    isChild: true,
    voice: 'cherry',
    instruction: '专为 6 岁一年级小朋友设计的耐心中小学助教。直接回答问题并给予表扬或记法，语速平缓温和，纯语音亲切启发！',
    systemPrompt: `你是专为 6 岁一年级小朋友设计的温柔助教。
【执行规则】：
1. 语速必须平缓温和、从容不迫，不可太快，充满耐心与鼓励。
2. 回答时先直接、明确地给出正确答案，再用一句简单的生活记法或表扬收尾。
3. 极其短小精炼，一气呵成，讲完即止，坚决杜绝长篇大论。
4. 纯音频亲切交流，默认不输出文本。`
  },
  hundred_thousand_whys: {
    name: '十万个为什么',
    icon: '🌟',
    isChild: true,
    voice: 'cherry',
    instruction: '面向 6 岁低年级小学生的趣味大自然与生活百科启蒙助手。用生动童趣的生活比喻解释大自然，语速平缓温和，纯语音生动讲解！',
    systemPrompt: `你是面向 6 岁小朋友的“十万个为什么”趣味科普助手。
【执行规则】：
1. 语速必须平缓温和、从容不迫，不可太快，生动有趣。
2. 用生动有趣的生活小比喻解释身边的科学秘密，严禁使用任何抽象深奥的专业科学术语。
3. 极短篇幅，每次只挑一个最直观、最好玩的点讲透，讲完即止。
4. 纯音频生动讲解，默认不输出文本，启发孩子的好奇心。`
  },
  socrates: {
    name: '苏格拉底',
    icon: '🏛️',
    isChild: false,
    voice: 'alloy',
    instruction: '古希腊哲学家苏格拉底。通过产婆术追问帮助审视核心前提与逻辑漏洞，每次提出有力反问。默认纯语音作答。',
    systemPrompt: `你是古希腊哲学家苏格拉底。
【执行规则】：
1. 你的任务是通过追问帮助学生审视观点前提与漏洞，绝不直接给出答案。
2. 聚焦学生观点中的核心逻辑漏洞，每次只提出一个核心反问。
3. 像面对面即时口语交流，精炼聚焦，不做长篇演讲。
4. 纯音频口语作答，默认不输出文本。`
  },
  opponent: {
    name: '反方辩友',
    icon: '⚔️',
    isChild: false,
    voice: 'alloy',
    instruction: '立场坚定的学术反方辩友。持相反立场展开对辩，集中火力反驳关键论据。默认纯语音对辩。',
    systemPrompt: `你是一位辩论赛中立场坚定的学术反方辩友。
【执行规则】：
1. 持相反立场，从财政学与公共政治经济学角度提出核心反驳论据。
2. 当学生提出极具说服力的学术依据时，可适度承认局部合理并调整立场，体现真实辩论交锋。
3. 语气坚定严谨、尊重对手，集中火力反驳 1 个关键论据。
4. 像面对面对辩一样干脆紧凑，避免冗长陈述。
5. 纯音频口语作答，默认不输出文本。`
  },
  collaborator: {
    name: '研讨伙伴',
    icon: '🤝',
    isChild: false,
    voice: 'alloy',
    instruction: '理性客观的财政学研讨伙伴。不迎合不挑刺，澄清概念并提出建构式启发问题。默认纯语音研讨。',
    systemPrompt: `你是理性客观的财政学学术研讨伙伴。
【执行规则】：
1. 不迎合、不挑刺，站在学生同侧帮助澄清概念、补充前置假设。
2. 梳理核心机制后提出一个建构式的启发推演问题，共同推演机制。
3. 精炼直接，像面对面学术讨论一样紧凑。
4. 纯音频口语交流，默认不输出文本。`
  },
  custom: {
    name: '自定义角色',
    icon: '✏️',
    isChild: false,
    voice: 'alloy',
    instruction: '请先在左侧设定角色的身份立场与提示词。以自然的口语化语气进行实时语音交流。默认纯语音作答。',
    systemPrompt: `你根据用户设定的身份与立场展开交流。
【执行规则】：
1. 忠实执行设定的身份与学术立场。
2. 保持专业一致性，以自然紧凑的口语化语气回应，杜绝长文宣读。
3. 纯音频口语作答，默认不输出文本。`
  }
};

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  checkAuthentication();
  initRoleSelection();
  initMediaAndFileUpload();
  initCallActions();
  initTextInput();
  updateRoleUI();
});

// ----------------------------------------------------
// 1. Password Verification & Auth Check
// ----------------------------------------------------
function checkAuthentication() {
  const savedPwd = sessionStorage.getItem('realtime_admin_pwd');
  if (!savedPwd) {
    showPasswordModal();
  }
}

function showPasswordModal() {
  passwordModalOverlay.classList.remove('hidden');
  passwordErrorTip.classList.add('hidden');
  adminPasswordInput.value = '';
  setTimeout(() => adminPasswordInput.focus(), 150);

  submitPasswordBtn.onclick = async () => {
    const pwd = adminPasswordInput.value.trim();
    if (!pwd) {
      passwordErrorTip.textContent = '⚠️ 请输入密码';
      passwordErrorTip.classList.remove('hidden');
      return;
    }

    submitPasswordBtn.disabled = true;
    submitPasswordBtn.textContent = '验证中...';

    try {
      const res = await fetch('/api/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        sessionStorage.setItem('realtime_admin_pwd', pwd);
        passwordModalOverlay.classList.add('hidden');
      } else {
        passwordErrorTip.textContent = '❌ ' + (data.error || '密码错误，请重新输入');
        passwordErrorTip.classList.remove('hidden');
      }
    } catch (e) {
      passwordErrorTip.textContent = '❌ 验证服务异常: ' + e.message;
      passwordErrorTip.classList.remove('hidden');
    } finally {
      submitPasswordBtn.disabled = false;
      submitPasswordBtn.textContent = '🔓 验证密码并进入';
    }
  };

  adminPasswordInput.onkeydown = (e) => {
    if (e.key === 'Enter') submitPasswordBtn.click();
  };
}

// ----------------------------------------------------
// 2. Role Selection
// ----------------------------------------------------
function initRoleSelection() {
  roleCards.forEach(card => {
    card.addEventListener('click', () => {
      const selected = card.getAttribute('data-role');
      if (selected === currentRole) return;

      roleCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      currentRole = selected;
      updateRoleUI();

      // If already in call, update session instructions in realtime
      if (isConnected && dc && dc.readyState === 'open') {
        sendSessionUpdate();
      }
    });
  });

  saveCustomRoleBtn.addEventListener('click', () => {
    const val = customPromptInput.value.trim();
    if (!val) {
      alert('请输入自定义角色的设定提示词！');
      return;
    }
    customRolePrompt = val;
    alert('自定义角色提示词已更新！');
    if (isConnected && dc && dc.readyState === 'open') {
      sendSessionUpdate();
    }
  });
}

function updateRoleUI() {
  const config = ROLE_CONFIGS[currentRole];
  instructionTitle.textContent = `${config.icon} ${config.name}`;
  instructionText.textContent = config.instruction;
  chatRoleLabel.textContent = `与「${config.name}」实时连线`;

  if (currentRole === 'custom') {
    customRolePanel.classList.remove('hidden');
  } else {
    customRolePanel.classList.add('hidden');
  }

  const welcomeIcon = config.isChild ? '🎒' : '💡';
  const childNotice = config.isChild ? '（专为6岁小朋友设计：语速慢、超短句、纯语音亲切交流）' : '';

  chatMessages.innerHTML = `
    <div class="system-welcome-msg">
      <div class="welcome-icon">${welcomeIcon}</div>
      <div>
        <strong>已切换至「${config.name}」${childNotice}</strong>
        <p>点击下方「开启实时连麦通话」开始交流。随时开口说话即可与 AI 互动！</p>
      </div>
    </div>
  `;
}

// ----------------------------------------------------
// 3. Media & Image Upload Handling (No Video)
// ----------------------------------------------------
function initMediaAndFileUpload() {
  // Dropzone file input
  fileInput.addEventListener('change', handleFileSelect);

  // Quick Snap/Upload Camera icon button
  cameraSnapBtn.addEventListener('click', () => {
    cameraInput.click();
  });
  cameraInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processImageFile(file);
  });

  removeFileBtn.addEventListener('click', () => {
    uploadedFileContent = '';
    uploadedImageBase64 = '';
    uploadedFileName = '';
    fileInput.value = '';
    cameraInput.value = '';
    fileLoadedBadge.classList.add('hidden');
    imagePreviewContainer.classList.add('hidden');
    dropzone.parentElement.classList.remove('hidden');
  });
}

async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    processImageFile(file);
    return;
  }

  // Handle PDF/TXT/MD
  uploadStatusText.textContent = '正在解析材料文本...';
  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '解析失败');

    uploadedFileContent = data.text;
    uploadedFileName = file.name;
    uploadStatusText.textContent = '点击拍照或上传图片 / 文档';
    dropzone.parentElement.classList.add('hidden');
    fileLoadedBadge.classList.remove('hidden');
    fileBadgeName.textContent = `已加载文档：${file.name}`;
    imagePreviewContainer.classList.add('hidden');
    appendChatMessage('system', `📄 已成功加载文档《${file.name}》，AI 将结合该材料进行讲解。`);
  } catch (err) {
    alert('文档上传失败: ' + err.message);
    uploadStatusText.textContent = '点击拍照或上传图片 / 文档';
  }
}

function processImageFile(file) {
  if (file.size > 8 * 1024 * 1024) {
    alert('图片大小不能超过 8MB！');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    uploadedImageBase64 = e.target.result; // data:image/...;base64,...
    uploadedFileName = file.name;

    imagePreview.src = uploadedImageBase64;
    imagePreviewContainer.classList.remove('hidden');
    dropzone.parentElement.classList.add('hidden');
    fileLoadedBadge.classList.remove('hidden');
    fileBadgeName.textContent = `已载入图片：${file.name}`;

    appendChatMessage('user', `（上传了图片题目）`, uploadedImageBase64);

    // If connected to WebRTC realtime, transmit image item immediately
    if (isConnected && dc && dc.readyState === 'open') {
      sendImageOverDataChannel(uploadedImageBase64);
    } else {
      // Prompt user to start call
      appendChatMessage('system', `📷 题目图片已就绪！点击「开启实时连麦通话」，AI 即可边看图边为你语音解答。`);
    }
  };
  reader.readAsDataURL(file);
}

// ----------------------------------------------------
// 4. WebRTC Full-Duplex Realtime Engine
// ----------------------------------------------------
function initCallActions() {
  toggleCallBtn.addEventListener('click', () => {
    if (!isConnected) {
      startRealtimeCall();
    } else {
      endRealtimeCall();
    }
  });

  hangupBtn.addEventListener('click', endRealtimeCall);

  muteToggleBtn.addEventListener('click', () => {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      isMuted = !isMuted;
      audioTrack.enabled = !isMuted;
      if (isMuted) {
        muteIcon.textContent = '🔇';
        muteText.textContent = '麦克风已关';
        muteToggleBtn.classList.add('btn-danger');
      } else {
        muteIcon.textContent = '🎙️';
        muteText.textContent = '麦克风开';
        muteToggleBtn.classList.remove('btn-danger');
      }
    }
  });
}

async function startRealtimeCall() {
  const pwd = sessionStorage.getItem('realtime_admin_pwd');
  if (!pwd) {
    showPasswordModal();
    return;
  }

  // Pre-unlock audio context for iOS/Safari
  unlockAudio();

  updateConnectionUI('connecting', '正在建立实时低延迟通话...');
  stageStatusText.textContent = '正在获取麦克风并连接阿里云百炼 Qwen-Omni 实时服务...';

  try {
    // 1. Get user microphone stream (Audio Only)
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000
      }
    });

    // 2. Setup Web Audio Visualizer
    setupAudioVisualizer(localStream);

    // 3. Initialize PeerConnection
    pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.services.mozilla.com' },
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });

    // 4. Add audio track
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    // 5. Create Data Channel for events (oai-events)
    dc = pc.createDataChannel('oai-events');
    setupDataChannel(dc);

    // 6. Listen for incoming AI remote audio stream
    pc.ontrack = (event) => {
      console.log('Received remote audio track from AI model');
      if (remoteAudio && event.streams && event.streams[0]) {
        remoteAudio.srcObject = event.streams[0];
        remoteAudio.play().catch(e => console.warn('Autoplay prevented:', e));
      }
    };

    pc.onconnectionstatechange = () => {
      console.log('WebRTC Connection State:', pc.connectionState);
      if (pc.connectionState === 'connected') {
        updateConnectionUI('connected', '实时通话中');
        stageStatusText.textContent = '🟢 实时语音通话已接通，请直接对着麦克风说话';
        audioWave.classList.add('active');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        if (isConnected) endRealtimeCall();
      }
    };

    // 7. Create SDP Offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // 8. Wait for ICE candidate gathering
    await waitForIceGathering(pc);

    // 9. Exchange SDP via backend proxy
    const res = await fetch('/api/realtime-session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Password': pwd
      },
      body: JSON.stringify({
        sdp: pc.localDescription.sdp,
        password: pwd,
        model: 'qwen3.5-omni-flash-realtime'
      })
    });

    const data = await res.json();
    if (!res.ok || !data.sdp) {
      throw new Error(data.error || data.message || '实时会话建立失败');
    }

    // 10. Set remote Answer SDP
    const answerSdp = normalizeSdpForSetRemote(data.sdp);
    await pc.setRemoteDescription({
      type: 'answer',
      sdp: answerSdp
    });

    isConnected = true;
    toggleCallBtn.classList.remove('start-call');
    toggleCallBtn.classList.add('end-call');
    toggleCallBtnText.textContent = '挂断当前通话';
    muteToggleBtn.classList.remove('hidden');
    hangupBtn.classList.remove('hidden');

  } catch (err) {
    console.error('Realtime Call Error:', err);
    alert('开启实时通话失败: ' + err.message);
    endRealtimeCall();
  }
}

function normalizeSdpForSetRemote(sdp) {
  let s = String(sdp).trim().replace(/\r?\n/g, "\r\n");
  if (!s.endsWith("\r\n")) s += "\r\n";
  return s;
}

function waitForIceGathering(peerConnection) {
  return new Promise((resolve) => {
    if (peerConnection.iceGatheringState === 'complete') {
      resolve();
    } else {
      const check = () => {
        if (peerConnection.iceGatheringState === 'complete') {
          peerConnection.removeEventListener('icegatheringstatechange', check);
          resolve();
        }
      };
      peerConnection.addEventListener('icegatheringstatechange', check);
      // Fallback timeout after 1.2s to prevent hanging
      setTimeout(resolve, 1200);
    }
  });
}

function setupDataChannel(channel) {
  channel.onopen = () => {
    console.log('DataChannel (oai-events) opened!');
    sendSessionUpdate();

    // If an image was loaded before connecting, send it now
    if (uploadedImageBase64) {
      sendImageOverDataChannel(uploadedImageBase64);
    }
  };

  channel.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerRealtimeEvent(msg);
    } catch (e) {
      console.log('DataChannel raw message:', event.data);
    }
  };

  channel.onerror = (err) => {
    console.error('DataChannel error:', err);
  };

  channel.onclose = () => {
    console.log('DataChannel closed');
  };
}

function sendSessionUpdate() {
  if (!dc || dc.readyState !== 'open') return;

  const config = ROLE_CONFIGS[currentRole];
  let prompt = config.systemPrompt;
  if (currentRole === 'custom' && customRolePrompt) {
    prompt = customRolePrompt;
  }
  if (uploadedFileContent) {
    prompt += `\n参考材料：${uploadedFileContent.slice(0, 2000)}`;
  }

  // All roles default to pure audio output, no text output
  const modalities = ["audio"];

  const sessionUpdateEvent = {
    type: "session.update",
    session: {
      modalities: modalities,
      instructions: prompt,
      voice: config.voice || "cherry",
      turn_detection: {
        type: "server_vad",
        threshold: 0.5,
        silence_duration_ms: 600
      }
    }
  };

  dc.send(JSON.stringify(sessionUpdateEvent));
  console.log('Sent session.update for role:', currentRole);
}

function handleServerRealtimeEvent(event) {
  console.log('Server Event:', event.type);

  if (event.type === 'response.audio.delta') {
    // Model is streaming audio output
    audioWave.classList.add('active');
    stageStatusText.textContent = `🔊 ${ROLE_CONFIGS[currentRole].name} 正在语音回答中...`;
  } else if (event.type === 'response.audio.done' || event.type === 'response.done') {
    stageStatusText.textContent = `🟢 正在聆听您的声音，请直接说话...`;
  } else if (event.type === 'input_audio_buffer.speech_started') {
    stageStatusText.textContent = `🎙️ 正在倾听您的说话...`;
    audioWave.classList.add('active');
  } else if (event.type === 'input_audio_buffer.speech_stopped') {
    stageStatusText.textContent = `💭 AI 正在处理回应...`;
  } else if (event.type === 'response.audio_transcript.done' || event.type === 'response.text.done') {
    // All roles default to pure audio output, showing friendly voice bubble
    appendVoiceBubble('ai');
  }
}

function endRealtimeCall() {
  isConnected = false;

  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
    localStream = null;
  }
  if (dc) {
    try { dc.close(); } catch (e) {}
    dc = null;
  }
  if (pc) {
    try { pc.close(); } catch (e) {}
    pc = null;
  }
  if (animFrameId) {
    cancelAnimationFrame(animFrameId);
    animFrameId = null;
  }

  updateConnectionUI('disconnected', '未连接');
  stageStatusText.textContent = '通话已结束。点击下方绿色按钮随时再次开启';
  audioWave.classList.remove('active');

  toggleCallBtn.classList.remove('end-call');
  toggleCallBtn.classList.add('start-call');
  toggleCallBtnText.textContent = '开启实时连麦通话';
  muteToggleBtn.classList.add('hidden');
  hangupBtn.classList.add('hidden');
}

function updateConnectionUI(state, text) {
  connStatusBadge.className = `conn-badge ${state}`;
  connStatusText.textContent = text;
  liveDot.className = `status-dot ${state === 'connected' ? 'green' : state === 'connecting' ? 'yellow' : 'gray'}`;
}

// ----------------------------------------------------
// 5. Send Text and Images
// ----------------------------------------------------
function initTextInput() {
  sendTextBtn.addEventListener('click', sendTextMessage);
  textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendTextMessage();
  });
}

async function sendTextMessage() {
  const text = textInput.value.trim();
  if (!text) return;

  textInput.value = '';
  appendChatMessage('user', text);

  // If in WebRTC session, send through DataChannel
  if (isConnected && dc && dc.readyState === 'open') {
    const userEvent = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: text }]
      }
    };
    dc.send(JSON.stringify(userEvent));
    dc.send(JSON.stringify({ type: "response.create" }));
    stageStatusText.textContent = `💭 已发送问题，AI 正在语音回答...`;
    return;
  }

  // If not connected via WebRTC, use multimodal fallback endpoint
  const pwd = sessionStorage.getItem('realtime_admin_pwd');
  stageStatusText.textContent = `💭 AI 正在思考回应中...`;

  try {
    const res = await fetch('/api/realtime-multimodal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: text }],
        roleType: currentRole,
        customPrompt: customRolePrompt,
        fileContent: uploadedFileContent,
        imageBase64: uploadedImageBase64,
        workspaceId: localStorage.getItem('dashscope_workspace_id') || '',
        password: pwd
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '回复失败');

    const aiReply = data.reply || '';
    // All roles default to pure audio output, displaying voice bubble
    appendVoiceBubble('ai');

    // Read aloud via Edge-TTS
    playFallbackSpeech(aiReply);
    stageStatusText.textContent = `准备就绪。随时可点击开启实时通话`;
  } catch (err) {
    alert('发送失败: ' + err.message);
  }
}

function sendImageOverDataChannel(imageBase64) {
  if (!dc || dc.readyState !== 'open') return;

  const imageEvent = {
    type: "conversation.item.create",
    item: {
      type: "message",
      role: "user",
      content: [
        {
          type: "input_image",
          image_url: imageBase64
        },
        {
          type: "input_text",
          text: currentRole === 'first_grade_tutor' 
            ? "请看看我拍的这张题目/生字图片，用简短温柔的语言为一年级小朋友讲解一下。"
            : "请观察这张图片，并结合十万个为什么为小朋友通俗科普。"
        }
      ]
    }
  };

  dc.send(JSON.stringify(imageEvent));
  dc.send(JSON.stringify({ type: "response.create" }));
  stageStatusText.textContent = `📷 图片已发送给 AI，正在语音讲解...`;
}

// ----------------------------------------------------
// 6. Audio Visualizer Setup
// ----------------------------------------------------
function setupAudioVisualizer(stream) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    const source = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 64;
    source.connect(analyserNode);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = audioWave.querySelectorAll('.bar');

    function renderFrame() {
      if (!isConnected) return;
      animFrameId = requestAnimationFrame(renderFrame);
      analyserNode.getByteFrequencyData(dataArray);

      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const avg = sum / bufferLength;

      if (avg > 15) {
        audioWave.classList.add('active');
      } else {
        audioWave.classList.remove('active');
      }
    }
    renderFrame();
  } catch (e) {
    console.warn('Audio visualizer setup failed:', e);
  }
}

function unlockAudio() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    if (remoteAudio) {
      remoteAudio.play().catch(() => {});
    }
  } catch (e) {}
}

function playFallbackSpeech(text) {
  if (!text || !text.trim()) return;
  const config = ROLE_CONFIGS[currentRole];
  const voice = config.isChild ? 'zh-CN-XiaoxiaoNeural' : 'zh-CN-YunxiNeural';
  const url = `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;
  const audio = new Audio(url);
  audio.play().catch(e => console.warn('Audio play blocked:', e));
}

// ----------------------------------------------------
// 7. Chat Feed Rendering
// ----------------------------------------------------
function appendChatMessage(role, text, imageSrc = null) {
  const msgRow = document.createElement('div');
  msgRow.className = `msg-row ${role}`;

  const roleName = role === 'user' ? '小朋友/学生' : (role === 'system' ? '系统提示' : ROLE_CONFIGS[currentRole].name);

  let imageHtml = '';
  if (imageSrc) {
    imageHtml = `<img src="${imageSrc}" class="chat-img-thumb" alt="题目图片">`;
  }

  msgRow.innerHTML = `
    <div class="msg-author">${roleName}</div>
    <div class="msg-bubble">
      <div>${escapeHtml(text)}</div>
      ${imageHtml}
    </div>
  `;

  chatMessages.appendChild(msgRow);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendVoiceBubble(role) {
  const msgRow = document.createElement('div');
  msgRow.className = `msg-row ${role}`;
  const roleName = ROLE_CONFIGS[currentRole].name;

  msgRow.innerHTML = `
    <div class="msg-author">${roleName}</div>
    <div class="msg-bubble">
      <span class="voice-bubble">
        <span class="sound-icon">🔊</span>
        <span>${roleName} 正在纯语音温和作答...</span>
      </span>
    </div>
  `;

  chatMessages.appendChild(msgRow);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
