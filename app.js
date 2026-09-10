let currentRole = 'socrates'; // 'socrates' | 'opponent' | 'custom' | 'proposal_reviewer'
let customRolePrompt = '';
let customWordCount = 200;
let uploadedFileContent = '';
let uploadedFileName = '';

// Mode & model state (set on entry layer, see section 7)
let currentMode = null; // null | 'debate' | 'tutor'
let currentModelId = '';
let availableModels = [];

let pendingImageDataUrl = '';

let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

let recordedSegments = []; // Array of string texts recognized so far
let chatHistory = []; // Array of { role: 'user'|'assistant', content: string }
let isDebateEnded = false;

// DOM Elements
const roleCards = document.querySelectorAll('.role-card');
const instructionTitle = document.getElementById('instructionTitle');
const instructionText = document.getElementById('instructionText');
const customRolePanel = document.getElementById('customRolePanel');
const customPromptInput = document.getElementById('customPromptInput');
const customWordCountInput = document.getElementById('customWordCountInput');
const saveCustomRoleBtn = document.getElementById('saveCustomRoleBtn');

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const uploadStatusText = document.getElementById('uploadStatusText');
const uploadSectionTitle = document.getElementById('uploadSectionTitle');
const uploadSectionTip = document.getElementById('uploadSectionTip');
const fileLoadedBadge = document.getElementById('fileLoadedBadge');
const fileBadgeName = document.getElementById('fileBadgeName');
const removeFileBtn = document.getElementById('removeFileBtn');

const chatRoleLabel = document.getElementById('chatRoleLabel');
const endDebateBtn = document.getElementById('endDebateBtn');

const chatMessages = document.getElementById('chatMessages');
const exportBtn = document.getElementById('exportBtn');

const ttsStatusOverlay = document.getElementById('ttsStatusOverlay');
const stopTtsBtn = document.getElementById('stopTtsBtn');

const audioSegmentsPreview = document.getElementById('audioSegmentsPreview');
const segmentsList = document.getElementById('segmentsList');

const recordBtn = document.getElementById('recordBtn');
const recordBtnText = document.getElementById('recordBtnText');
const recStatusIcon = document.getElementById('recStatusIcon');
const recStatusText = document.getElementById('recStatusText');
const submitDebateBtn = document.getElementById('submitDebateBtn');

// Entry layer DOM
const modeSelectOverlay = document.getElementById('modeSelectOverlay');
const modeCards = document.querySelectorAll('.mode-card');
const modelGrid = document.getElementById('modelGrid');
const enterModeBtn = document.getElementById('enterModeBtn');
const backToModeBtn = document.getElementById('backToModeBtn');

// Mode containers
const debateSidebar = document.getElementById('debateSidebar');
const tutorSidebar = document.getElementById('tutorSidebar');
const inputControlsArea = document.getElementById('inputControlsArea');
const tutorInputArea = document.getElementById('tutorInputArea');

// Tutor UI
const tutorRoleCards = document.querySelectorAll('.tutor-role');
const tutorInstructionTitle = document.getElementById('tutorInstructionTitle');
const tutorInstructionText = document.getElementById('tutorInstructionText');
const tutorCustomPanel = document.getElementById('tutorCustomPanel');
const tutorCustomPromptInput = document.getElementById('tutorCustomPromptInput');
const tutorWordCountInput = document.getElementById('tutorWordCountInput');
const saveTutorCustomBtn = document.getElementById('saveTutorCustomBtn');
const tutorTextInput = document.getElementById('tutorTextInput');
const tutorSendBtn = document.getElementById('tutorSendBtn');

// Tutor image upload DOM
const imageInput = document.getElementById('imageInput');
const imageDropzone = document.getElementById('imageDropzone');
const imageUploadStatusText = document.getElementById('imageUploadStatusText');
const tutorImageStrip = document.getElementById('tutorImageStrip');
const tutorPendingThumb = document.getElementById('tutorPendingThumb');
const removeImageBtn = document.getElementById('removeImageBtn');

// Password Unlock Modal DOM
const passwordModalOverlay = document.getElementById('passwordModalOverlay');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const passwordErrorTip = document.getElementById('passwordErrorTip');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');
const submitPasswordBtn = document.getElementById('submitPasswordBtn');

let unlockedPassword = sessionStorage.getItem('unlockedAdminPassword') || '';
let pendingDebateIsEnd = false;

// Role Configuration Data
const ROLE_CONFIGS = {
  socrates: {
    name: '苏格拉底',
    icon: '🏛️',
    instruction: '请先用语音表达你的观点（如"我认为……"），苏格拉底将通过追问引导你深入思考。你可以分多段录音，录完后点击「提交」。每轮对话后认真回应他的追问。'
  },
  opponent: {
    name: '反方辩友',
    icon: '⚔️',
    instruction: '请先用语音陈述你的立场（如"我支持……"），AI 将自动持相反立场与你展开辩论。你可以分多段录音，录完后点击「提交」。论点有力时 AI 的立场会有所松动；准备结束时点击「结束辩论」，AI 将总结被说服的程度。'
  },
  collaborator: {
    name: '研讨伙伴',
    icon: '🤝',
    instruction: '请用语音陈述你的观点或疑问，研讨伙伴将不迎合、不刁难，与你平等探讨，帮您澄清概念、补充逻辑前提并共同推演机制。你可以分多段录音，录完后点击「提交」。'
  },
  custom: {
    name: '自定义角色',
    icon: '✏️',
    instruction: '请先在左侧设定角色的身份立场与期望的回复字数限制（最大500字），保存后使用语音进行交流。'
  },
  proposal_reviewer: {
    name: 'Proposal 审查',
    icon: '📋',
    instruction: '【⚠️ 必须提供附件】审查导师将结合你上传的《财税计量方法与应用》Proposal 论文文件，先后从【选题来源与贡献】、【计量模型与识别方法】、【数据与样本】、【核心 Stata 代码】、【内生性与稳健性】这几个角度深入质询（每个角度提约2个问题）。请先在左侧上传你的 Proposal 附件（PDF/TXT/MD）。'
  }
};

function getRoleConfig() {
  return currentMode === 'tutor' ? TUTOR_ROLE_CONFIGS[currentRole] : ROLE_CONFIGS[currentRole];
}

// Initialize event listeners on page load
document.addEventListener('DOMContentLoaded', () => {
  initRoleSelection();
  initFileUpload();
  initAudioRecorder();
  initDebateActions();
  initTTS();
  initPasswordModal();
  initEntryOverlay();
});

function initPasswordModal() {
  if (!passwordModalOverlay || !submitPasswordBtn || !cancelPasswordBtn) return;

  cancelPasswordBtn.addEventListener('click', () => {
    passwordModalOverlay.classList.add('hidden');
    passwordErrorTip.classList.add('hidden');
    recStatusIcon.textContent = '🔒';
    recStatusText.textContent = '每日免费调用额度已用完，需要输入解锁密码';
  });

  submitPasswordBtn.addEventListener('click', () => {
    const pwd = adminPasswordInput.value.trim();
    if (!pwd) {
      passwordErrorTip.textContent = '⚠️ 请输入密码';
      passwordErrorTip.classList.remove('hidden');
      return;
    }

    unlockedPassword = pwd;
    sessionStorage.setItem('unlockedAdminPassword', pwd);
    passwordModalOverlay.classList.add('hidden');
    passwordErrorTip.classList.add('hidden');
    adminPasswordInput.value = '';

    // Retry sending the debate message
    sendDebateMessage(pendingDebateIsEnd);
  });

  // Support pressing Enter key in password input
  adminPasswordInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitPasswordBtn.click();
    }
  });
}

// ----------------------------------------------------
// 1. Role Selection & Custom Role Logic
// ----------------------------------------------------
function initRoleSelection() {
  roleCards.forEach(card => {
    card.addEventListener('click', () => {
      const selected = card.getAttribute('data-role');
      if (selected === currentRole) return;

      // Switch active class
      roleCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');

      currentRole = selected;
      updateRoleUI();
    });
  });

  saveCustomRoleBtn.addEventListener('click', () => {
    const val = customPromptInput.value.trim();
    const wc = parseInt(customWordCountInput.value, 10);
    if (!val) {
      alert('请输入自定义角色的提示词描述！');
      return;
    }
    if (isNaN(wc) || wc < 10 || wc > 500) {
      alert('请输入正确的字数限制（10 ~ 500 字之间）！');
      return;
    }
    customRolePrompt = val;
    customWordCount = wc;
    alert(`自定义角色设定已保存！回复字数上限限制为：${customWordCount}字。`);
  });
}


function updateRoleUI() {
  const config = getRoleConfig();
  instructionTitle.textContent = `${config.icon} ${config.name}`;
  instructionText.textContent = config.instruction;
  chatRoleLabel.textContent = `与「${config.name}」对话中`;

  if (currentRole === 'custom') {
    customRolePanel.classList.remove('hidden');
  } else {
    customRolePanel.classList.add('hidden');
  }

  if (currentRole === 'proposal_reviewer') {
    uploadSectionTitle.innerHTML = '2. 参考 Proposal 材料 <span style="color: #ef4444; font-size: 0.9em; font-weight: 700;">(⚠️ 必填)</span>';
    uploadSectionTip.innerHTML = '<strong style="color: #f59e0b;">【必须上传】</strong>请上传你的 Proposal 论文文档（支持 PDF / TXT / MD，≤5MB），审查导师将结合材料展开质询。';
  } else {
    uploadSectionTitle.textContent = '2. 参考背景材料 (可选)';
    uploadSectionTip.textContent = '支持上传 PDF / TXT / MD 文件（≤5MB），AI 将结合材料进行追问或对辩。';
  }

  // Reset conversation for new role
  resetConversation();
}

function resetConversation() {
  chatHistory = [];
  recordedSegments = [];
  isDebateEnded = false;
  if (typeof setPendingImage === 'function') setPendingImage('');
  renderSegments();
  updateSubmitButtonState();
  
  let welcomeHtml;
  if (currentMode === 'tutor') {
    welcomeHtml = `<strong>已切换至「${TUTOR_ROLE_CONFIGS[currentRole].name}」，请直接打字提问。</strong>`;
  } else {
    welcomeHtml = `<strong>已切换至「${getRoleConfig().name}」角色对话！</strong><p>请录制你的发问或立场表达，随后点击「提交发问」。</p>`;
  }
  chatMessages.innerHTML = `
    <div class="system-welcome-msg">
      <div class="welcome-icon">💡</div>
      <div>${welcomeHtml}</div>
    </div>
  `;
  exportBtn.disabled = true;
  endDebateBtn.disabled = false;
}

// ----------------------------------------------------
// 2. File Upload Handling (.pdf, .txt, .md)
// ----------------------------------------------------
function initFileUpload() {
  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('文件大小不能超过 5MB！');
      return;
    }

    uploadStatusText.textContent = '正在解析文件文本...';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || '解析失败');
      }

      uploadedFileContent = data.text;
      uploadedFileName = file.name;

      uploadStatusText.textContent = '点击或拖拽上传 PDF / TXT / MD';
      dropzone.parentElement.classList.add('hidden');
      fileLoadedBadge.classList.remove('hidden');
      fileBadgeName.textContent = `已加载：${file.name}`;
    } catch (err) {
      console.error(err);
      alert('文件上传/解析出错: ' + err.message);
      uploadStatusText.textContent = '点击或拖拽上传 PDF / TXT / MD';
    }
  });

  removeFileBtn.addEventListener('click', () => {
    uploadedFileContent = '';
    uploadedFileName = '';
    fileInput.value = '';
    fileLoadedBadge.classList.add('hidden');
    dropzone.parentElement.classList.remove('hidden');
  });
}

// ----------------------------------------------------
// 3. Audio Recording & Multi-Segment ASR
// ----------------------------------------------------
function initAudioRecorder() {
  recordBtn.addEventListener('click', async () => {
    if (isDebateEnded) return;

    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  });

  submitDebateBtn.addEventListener('click', () => {
    const validTexts = recordedSegments.map(s => s.trim()).filter(Boolean);
    if (validTexts.length === 0 || isDebateEnded) return;

    // 预解锁移动端 (iOS/Android) 浏览器的音频播放手势限制
    if ('speechSynthesis' in window) {
      try {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
        const silentUtterance = new SpeechSynthesisUtterance('');
        silentUtterance.volume = 0.01;
        window.speechSynthesis.speak(silentUtterance);
      } catch (e) {}
    }

    const combinedText = validTexts.join(' ');
    recordedSegments = [];
    renderSegments();
    sendChatMessage(combinedText);
  });
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // Stop all mic tracks
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await processAudioChunk(audioBlob);
    };

    mediaRecorder.start();
    isRecording = true;

    recordBtn.classList.add('recording');
    recordBtnText.textContent = '点击 停止录音';
    recStatusIcon.textContent = '🔴';
    recStatusText.textContent = '正在录音中，说完后再次点击停止...';
  } catch (err) {
    console.error('Microphone Access Error:', err);
    alert('无法访问麦克风，请检查浏览器权限设置！');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording = false;

  recordBtn.classList.remove('recording');
  recordBtnText.textContent = '按住/点击 说话';
  recStatusIcon.textContent = '⏳';
  recStatusText.textContent = '正在识别本段语音中...';
}

async function processAudioChunk(blob) {
  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'audio/webm',
      },
      body: blob,
    });

    const resText = await response.text();
    let data;
    try {
      data = JSON.parse(resText);
    } catch (e) {
      throw new Error(`服务器服务响应错误 (${response.status}): ${resText.slice(0, 50)}`);
    }

    if (!response.ok) {
      throw new Error(data.error || '语音识别失败');
    }

    const recognizedText = (data.text || '').trim();
    if (recognizedText) {
      recordedSegments.push(recognizedText);
      renderSegments();
      recStatusIcon.textContent = '✅';
      recStatusText.textContent = `第 ${recordedSegments.length} 段语音识别成功！可继续录制或提交。`;
    } else {
      recStatusIcon.textContent = '⚠️';
      recStatusText.textContent = '未清晰识别到声音，请重试。';
    }
  } catch (err) {
    console.error('ASR Error:', err);
    recStatusIcon.textContent = '❌';
    recStatusText.textContent = '语音识别失败: ' + err.message;
  } finally {
    updateSubmitButtonState();
  }
}

function renderSegments() {
  if (recordedSegments.length === 0) {
    audioSegmentsPreview.classList.add('hidden');
    segmentsList.innerHTML = '';
  } else {
    audioSegmentsPreview.classList.remove('hidden');
    segmentsList.innerHTML = recordedSegments.map((text, idx) => `
      <div class="segment-item">
        <span class="segment-num">#${idx + 1}</span>
        <textarea class="segment-input" rows="3" oninput="updateSegmentText(${idx}, this.value)" placeholder="此处显示识别出的文字，可直接编辑修改错别字...">${escapeHtml(text)}</textarea>
        <button class="del-seg-btn" onclick="deleteSegment(${idx})" title="删除此段">&times;</button>
      </div>
    `).join('');
  }
  updateSubmitButtonState();
}

window.updateSegmentText = function(index, newText) {
  recordedSegments[index] = newText;
  updateSubmitButtonState();
};

window.deleteSegment = function(index) {
  recordedSegments.splice(index, 1);
  renderSegments();
};

function updateSubmitButtonState() {
  const hasValidText = recordedSegments.some(t => t.trim().length > 0);
  submitDebateBtn.disabled = !hasValidText || isDebateEnded;
}

// ----------------------------------------------------
// 4. Chat logic (LLM Call & Feed rendering)
// ----------------------------------------------------
function initDebateActions() {
  endDebateBtn.addEventListener('click', () => {
    if (confirm('确定要结束辩论并听取反方辩友的最终总结吗？')) {
      isDebateEnded = true;
      endDebateBtn.disabled = true;
      recordBtn.disabled = true;
      submitDebateBtn.disabled = true;

      sendChatMessage('（学生请求结束辩论）', true);
    }
  });

  exportBtn.addEventListener('click', exportDebateMarkdown);
}

async function sendChatMessage(userText, isEnd = false, imageDataUrl = '') {
  if (currentRole === 'custom') {
    const hasPrompt = currentMode === 'tutor' ? !!tutorCustomPrompt : !!customRolePrompt;
    if (!hasPrompt) {
      alert('请先在左侧输入并保存自定义角色的提示词设定！');
      return;
    }
  }

  if (currentRole === 'proposal_reviewer' && !uploadedFileContent) {
    alert('【Proposal 审查】角色要求必须先在左侧上传你的 Proposal 论文文件（PDF/TXT/MD）！上传后方可开始审查。');
    return;
  }

  // Add User Message to History
  if (!isEnd) {
    const historyEntry = { role: 'user', content: userText };
    if (imageDataUrl) historyEntry.imageUrl = imageDataUrl; // 仅用于气泡展示，不发给后端
    chatHistory.push(historyEntry);
    appendMessageToFeed('user', userText, imageDataUrl || null);
  }

  recStatusIcon.textContent = '💭';
  recStatusText.textContent = currentMode === 'tutor' ? 'AI 伙伴正在思考...' : 'AI 正在思考回应中...';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory.map(({ role, content }) => ({ role, content })),
        roleType: currentRole,
        customPrompt: currentMode === 'tutor' ? tutorCustomPrompt : customRolePrompt,
        customWordCount: currentMode === 'tutor' ? tutorWordCount : customWordCount,
        fileContent: uploadedFileContent,
        isEnd: isEnd,
        providedPassword: unlockedPassword,
        modelId: currentModelId,
        imageDataUrl: imageDataUrl || undefined
      }),
    });

    const data = await response.json();

    // Check if daily quota is exceeded
    if (response.status === 429 || data.error === 'QUOTA_EXCEEDED') {
      pendingDebateIsEnd = isEnd;
      passwordModalOverlay.classList.remove('hidden');
      if (unlockedPassword) {
        // If unlockedPassword was tried but still failed, it means password was wrong
        passwordErrorTip.textContent = '❌ 密码不正确，请重新输入';
        passwordErrorTip.classList.remove('hidden');
      } else {
        passwordErrorTip.classList.add('hidden');
      }
      adminPasswordInput.focus();

      recStatusIcon.textContent = '🔐';
      recStatusText.textContent = '今日公共额度已满，等待输入教师解锁密码...';
      return;
    }

    if (!response.ok) {
      throw new Error(data.error || 'AI 回复异常');
    }

    const aiReply = data.reply || '';
    chatHistory.push({ role: 'assistant', content: aiReply });
    appendMessageToFeed('ai', aiReply);

    // Speak AI Reply using Web Speech Synthesis
    speakText(aiReply);

    recStatusIcon.textContent = '🎙️';
    recStatusText.textContent = currentMode === 'tutor' ? '可以继续提问' : '准备就绪，点击开始说话';
    exportBtn.disabled = false;
  } catch (err) {
    console.error('Chat Error:', err);
    recStatusIcon.textContent = '❌';
    recStatusText.textContent = 'AI 思考出错: ' + err.message;
  }
}

function appendMessageToFeed(role, text, imageUrl = null) {
  const msgRow = document.createElement('div');
  msgRow.className = `msg-row ${role}`;

  const roleName = role === 'user' ? (currentMode === 'tutor' ? '小朋友 (你)' : '学生 (你)') : getRoleConfig().name;

  const imageHtml = imageUrl
    ? `<img class="msg-image" src="${imageUrl}" alt="发送的图片">`
    : '';

  msgRow.innerHTML = `
    <div class="msg-author">${roleName}</div>
    ${imageHtml}
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;

  chatMessages.appendChild(msgRow);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ----------------------------------------------------
// 5. Cloud Edge-TTS HTML5 Audio Stream (全平台情感朗读)
// ----------------------------------------------------
let currentAudioElement = null;

function initTTS() {
  stopTtsBtn.addEventListener('click', () => {
    if (currentAudioElement) {
      currentAudioElement.pause();
      currentAudioElement = null;
    }
    ttsStatusOverlay.classList.add('hidden');
  });
}

function speakText(text) {
  if (!text || !text.trim()) return;

  // 1. 停止上一次未读完的音频
  if (currentAudioElement) {
    try {
      currentAudioElement.pause();
    } catch (e) {}
    currentAudioElement = null;
  }

  // 2. 根据角色选择最适合的微软云端 Neural 神经网络声音
  // 反方辩友与 Proposal 审查选用沉稳严肃男声 Yunxi，苏格拉底/自定义选用自然启发女声 Xiaoxiao
  let voice = 'zh-CN-XiaoxiaoNeural';
  if (currentRole === 'opponent' || currentRole === 'proposal_reviewer') {
    voice = 'zh-CN-YunxiNeural';
  }

  // 3. 构建 Edge-TTS 云端音频流接口 URL
  const ttsUrl = `/api/tts?text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}`;

  // 4. 创建 HTML5 Audio 在全平台 (手机 & 电脑) 100% 稳定流畅播放
  currentAudioElement = new Audio(ttsUrl);

  currentAudioElement.onplay = () => {
    ttsStatusOverlay.classList.remove('hidden');
  };

  currentAudioElement.onended = () => {
    ttsStatusOverlay.classList.add('hidden');
    currentAudioElement = null;
  };

  currentAudioElement.onerror = (err) => {
    console.error('Edge-TTS Audio Playback Error:', err);
    ttsStatusOverlay.classList.add('hidden');
    currentAudioElement = null;
  };

  // 播放音频
  currentAudioElement.play().catch(err => {
    console.warn('Audio Autoplay Blocked or Failed:', err);
  });
}

// ----------------------------------------------------
// 6. Markdown Export
// ----------------------------------------------------
function exportDebateMarkdown() {
  if (chatHistory.length === 0) return;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let mdContent = `# 财政学 AI 语音辩论记录\n\n`;
  mdContent += `- **辩论角色**：${getRoleConfig().name}\n`;
  mdContent += `- **生成时间**：${dateStr}\n`;
  if (uploadedFileName) {
    mdContent += `- **参考附件**：${uploadedFileName}\n`;
  }
  if (currentRole === 'custom') {
    mdContent += `- **角色设定提示词**：${customRolePrompt}\n`;
  }
  mdContent += `\n---\n\n`;

  chatHistory.forEach(msg => {
    const speaker = msg.role === 'user' ? '**学生**' : `**${getRoleConfig().name}**`;
    mdContent += `${speaker}：${msg.content}\n\n`;
  });

  mdContent += `---\n*本记录由财政学 AI 语音辩论助教工具自动生成*\n`;

  // Download blob file
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `财政学辩论记录_${getRoleConfig().name}_${now.toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// Utility HTML escaper
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ----------------------------------------------------
// 7. Mode & Model Entry Layer (对辩 / 教辅 + 模型选择)
// ----------------------------------------------------
const TUTOR_ROLE_CONFIGS = {
  first_grade: {
    name: '一年级助教',
    icon: '🎒',
    instruction: '请把问题直接打字输入下方文本框，按回车或点「发送」。温柔助教会一步步引导你自己思考，不直接给答案。答对了会表扬你哦！'
  },
  whys: {
    name: '十万个为什么',
    icon: '🌟',
    instruction: '把你好奇的问题打字输入下方文本框，「十万个为什么」会用生活中的小比喻为你讲解自然科学的秘密。'
  },
  custom: {
    name: '自定义伙伴',
    icon: '✏️',
    instruction: '请先在左侧设定伙伴的身份风格与回复字数上限（10~200 字），保存后打字交流。'
  }
};

let tutorCustomPrompt = '';
let tutorWordCount = 60;

function initEntryOverlay() {
  modeCards.forEach(card => {
    card.addEventListener('click', () => {
      modeCards.forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      currentMode = card.getAttribute('data-mode');
      updateEnterButtonState();
    });
  });

  modelGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.model-card');
    if (!card || card.classList.contains('disabled')) return;
    modelGrid.querySelectorAll('.model-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    currentModelId = card.getAttribute('data-model-id');
    updateEnterButtonState();
  });

  enterModeBtn.addEventListener('click', enterSelectedMode);

  backToModeBtn.addEventListener('click', () => {
    if (chatHistory.length > 0 && !confirm('返回将结束当前对话，确定吗？')) return;
    returnToEntry();
  });

  fetchModelsAndRender();
}

async function fetchModelsAndRender() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    availableModels = data.models || [];
  } catch (err) {
    console.error('加载模型列表失败:', err);
    availableModels = [];
  }
  renderModelCards();
}

function renderModelCards() {
  if (availableModels.length === 0) {
    modelGrid.innerHTML = '<div class="model-load-error">⚠️ 模型列表加载失败，请刷新页面重试</div>';
    return;
  }
  modelGrid.innerHTML = availableModels.map(m => `
    <div class="model-card${m.keyConfigured ? '' : ' disabled'}" data-model-id="${m.id}">
      <div class="model-provider">${m.provider}</div>
      <div class="model-name">${m.label}</div>
      <div class="model-cap">${m.keyConfigured ? (m.vision ? '✓ 支持图片' : '纯文本') : '未配置该平台 Key'}</div>
    </div>
  `).join('');

  // Default selection: prefer qwen-flash, otherwise first configured model
  const defaultModel = availableModels.find(m => m.id === 'qwen-flash' && m.keyConfigured)
    || availableModels.find(m => m.keyConfigured);
  if (defaultModel) {
    const card = modelGrid.querySelector(`.model-card[data-model-id="${defaultModel.id}"]`);
    if (card) card.classList.add('active');
    currentModelId = defaultModel.id;
  }
  updateEnterButtonState();
}

function updateEnterButtonState() {
  enterModeBtn.disabled = !(currentMode && currentModelId);
}

function enterSelectedMode() {
  if (!currentMode || !currentModelId) return;
  sessionStorage.setItem('aidebate_mode', currentMode);
  sessionStorage.setItem('aidebate_model', currentModelId);
  modeSelectOverlay.classList.add('hidden');
  backToModeBtn.classList.remove('hidden');
  applyMode();
}

function returnToEntry() {
  sessionStorage.removeItem('aidebate_mode');
  sessionStorage.removeItem('aidebate_model');
  resetConversation();
  currentMode = null;
  modeSelectOverlay.classList.remove('hidden');
  backToModeBtn.classList.add('hidden');
}

function applyMode() {
  const isTutor = currentMode === 'tutor';
  debateSidebar.classList.toggle('hidden', isTutor);
  tutorSidebar.classList.toggle('hidden', !isTutor);
  inputControlsArea.classList.toggle('hidden', isTutor);
  tutorInputArea.classList.toggle('hidden', !isTutor);
  exportBtn.classList.toggle('hidden', isTutor);
  endDebateBtn.classList.add('hidden');

  if (isTutor) {
    setTutorRole('first_grade');
  } else {
    setDebateRole('socrates');
  }
  resetConversation();
}

function setDebateRole(roleKey) {
  currentRole = roleKey;
  roleCards.forEach(c => c.classList.toggle('active', c.getAttribute('data-role') === roleKey));
  updateRoleUI();
}

function setTutorRole(roleKey) {
  currentRole = roleKey;
  tutorRoleCards.forEach(c => c.classList.toggle('active', c.getAttribute('data-role') === roleKey));
  const config = TUTOR_ROLE_CONFIGS[roleKey];
  tutorInstructionTitle.textContent = `${config.icon} ${config.name}`;
  tutorInstructionText.textContent = config.instruction;
  chatRoleLabel.textContent = `与「${config.name}」对话中`;
  tutorCustomPanel.classList.toggle('hidden', roleKey !== 'custom');
  resetConversation();
}

function initTutorRoleSelection() {
  tutorRoleCards.forEach(card => {
    card.addEventListener('click', () => {
      const selected = card.getAttribute('data-role');
      if (selected === currentRole) return;
      setTutorRole(selected);
    });
  });

  saveTutorCustomBtn.addEventListener('click', () => {
    const val = tutorCustomPromptInput.value.trim();
    const wc = parseInt(tutorWordCountInput.value, 10);
    if (!val) {
      alert('请输入自定义伙伴的提示词描述！');
      return;
    }
    if (isNaN(wc) || wc < 10 || wc > 200) {
      alert('请输入正确的字数上限（10 ~ 200 字之间）！');
      return;
    }
    tutorCustomPrompt = val;
    tutorWordCount = wc;
    alert(`自定义伙伴设定已保存！回复字数上限为：${tutorWordCount}字。`);
  });
}

initTutorRoleSelection();

function updateTutorSendState() {
  const hasText = tutorTextInput.value.trim().length > 0;
  tutorSendBtn.disabled = isDebateEnded || (!hasText && !pendingImageDataUrl);
}

async function sendTutorMessage() {
  const text = tutorTextInput.value.trim();
  if (isDebateEnded) return;
  if (!text && !pendingImageDataUrl) return;
  if (currentRole === 'custom' && !tutorCustomPrompt) {
    alert('请先在左侧输入并保存自定义伙伴的提示词！');
    return;
  }
  if (pendingImageDataUrl) {
    const modelInfo = availableModels.find(m => m.id === currentModelId);
    if (modelInfo && !modelInfo.vision) {
      alert('当前模型不支持看图，请点左上角「← 重选」更换模型。');
      return;
    }
  }
  const finalText = text || (pendingImageDataUrl ? IMAGE_GUIDE_TEXT : '');
  tutorTextInput.value = '';
  const imageDataUrl = pendingImageDataUrl;
  setPendingImage('');
  updateTutorSendState();
  await sendChatMessage(finalText, false, imageDataUrl);
}

function initTutorInput() {
  tutorSendBtn.addEventListener('click', sendTutorMessage);
  tutorTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTutorMessage();
    }
  });
  tutorTextInput.addEventListener('input', updateTutorSendState);
}

initTutorInput();

const IMAGE_GUIDE_TEXT = '请看一看这张图片并回答问题';

function compressImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new Error('仅支持 JPG / PNG / WebP 图片'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      reject(new Error('图片大小不能超过 10MB'));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        try {
          const MAX_SIDE = 1280;
          const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (err) {
          reject(new Error('图片压缩失败: ' + err.message));
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function setPendingImage(dataUrl) {
  pendingImageDataUrl = dataUrl;
  tutorImageStrip.classList.toggle('hidden', !dataUrl);
  imageDropzone.parentElement.classList.toggle('hidden', !!dataUrl);
  if (dataUrl) {
    tutorPendingThumb.src = dataUrl;
    imageUploadStatusText.textContent = '点击上传题目图片';
  }
  updateTutorSendState();
}

function initTutorImageUpload() {
  imageInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    imageUploadStatusText.textContent = '正在压缩图片...';
    try {
      const dataUrl = await compressImageFile(file);
      setPendingImage(dataUrl);
    } catch (err) {
      console.error('Image processing error:', err);
      alert(err.message);
      imageUploadStatusText.textContent = '点击上传题目图片';
    } finally {
      imageInput.value = '';
    }
  });

  removeImageBtn.addEventListener('click', () => setPendingImage(''));
}

initTutorImageUpload();
