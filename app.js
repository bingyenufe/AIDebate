let currentRole = 'socrates'; // 'socrates' | 'opponent' | 'custom' | 'proposal_reviewer'
let customRolePrompt = '';
let customWordCount = 200;
let uploadedFileContent = '';
let uploadedFileName = '';

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

// Initialize event listeners on page load
document.addEventListener('DOMContentLoaded', () => {
  initRoleSelection();
  initFileUpload();
  initAudioRecorder();
  initDebateActions();
  initTTS();
});

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
  const config = ROLE_CONFIGS[currentRole];
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
  renderSegments();
  updateSubmitButtonState();
  
  chatMessages.innerHTML = `
    <div class="system-welcome-msg">
      <div class="welcome-icon">💡</div>
      <div>
        <strong>已切换至「${ROLE_CONFIGS[currentRole].name}」角色对话！</strong>
        <p>请录制你的发问或立场表达，随后点击「提交发问」。</p>
      </div>
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
        <input type="text" class="segment-input" value="${escapeHtml(text)}" oninput="updateSegmentText(${idx}, this.value)" placeholder="此处显示识别出的文字，可直接编辑修改错别字...">
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

async function sendChatMessage(userText, isEnd = false) {
  if (currentRole === 'custom' && !customRolePrompt) {
    alert('请先在左侧输入并保存自定义角色的提示词设定！');
    return;
  }

  if (currentRole === 'proposal_reviewer' && !uploadedFileContent) {
    alert('【Proposal 审查】角色要求必须先在左侧上传你的 Proposal 论文文件（PDF/TXT/MD）！上传后方可开始审查。');
    return;
  }

  // Add User Message to History
  if (!isEnd) {
    chatHistory.push({ role: 'user', content: userText });
    appendMessageToFeed('user', userText);
  }

  recStatusIcon.textContent = '💭';
  recStatusText.textContent = 'AI 正在思考回应中...';

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: chatHistory,
        roleType: currentRole,
        customPrompt: customRolePrompt,
        customWordCount: customWordCount,
        fileContent: uploadedFileContent,
        isEnd: isEnd
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'AI 回复异常');
    }

    const aiReply = data.reply || '';
    chatHistory.push({ role: 'assistant', content: aiReply });
    appendMessageToFeed('ai', aiReply);

    // Speak AI Reply using Web Speech Synthesis
    speakText(aiReply);

    recStatusIcon.textContent = '🎙️';
    recStatusText.textContent = '准备就绪，点击开始说话';
    exportBtn.disabled = false;
  } catch (err) {
    console.error('Chat Error:', err);
    recStatusIcon.textContent = '❌';
    recStatusText.textContent = 'AI 思考出错: ' + err.message;
  }
}

function appendMessageToFeed(role, text) {
  const msgRow = document.createElement('div');
  msgRow.className = `msg-row ${role}`;

  const roleName = role === 'user' ? '学生 (你)' : ROLE_CONFIGS[currentRole].name;

  msgRow.innerHTML = `
    <div class="msg-author">${roleName}</div>
    <div class="msg-bubble">${escapeHtml(text)}</div>
  `;

  chatMessages.appendChild(msgRow);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ----------------------------------------------------
// 5. Browser Native Web Speech Synthesis (TTS)
// ----------------------------------------------------
let selectedMandarinVoice = null;

function pickBestMandarinVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // 严格过滤：必须为普通话 (绝对排除 zh-HK 粤语、zh-TW 繁体等)
  const isMandarin = (v) => {
    const lang = (v.lang || '').toLowerCase();
    const name = (v.name || '').toLowerCase();
    // 排除粤语 Cantonese (HK) 和 台湾腔 (TW)
    if (lang.includes('hk') || lang.includes('tw') || name.includes('cantonese') || name.includes('hong kong') || name.includes('taiwan')) {
      return false;
    }
    return (
      lang.includes('zh-cn') || 
      lang.includes('zh_cn') || 
      lang === 'zh' || 
      name.includes('chinese (simplified') || 
      name.includes('mainland') || 
      name.includes('mandarin') || 
      name.includes('xiaoxiao') || 
      name.includes('yunxi') || 
      name.includes('yunjian')
    );
  };

  const mandarinVoices = voices.filter(isMandarin);

  // 1. 优先在普通话中寻找 Natural / Online / Neural 高品质情感声音
  let best = mandarinVoices.find(v => {
    const n = v.name.toLowerCase();
    return n.includes('natural') || n.includes('online') || n.includes('neural');
  });

  // 2. 备选：普通的普通话语音
  if (!best && mandarinVoices.length > 0) {
    best = mandarinVoices[0];
  }

  // 3. 兜底方案：如果无标记，匹配以 zh-CN / zh 开头且排除 HK/TW 的声音
  if (!best) {
    best = voices.find(v => {
      const l = v.lang.toLowerCase();
      return (l.startsWith('zh-cn') || l === 'zh') && !l.includes('hk') && !l.includes('tw');
    });
  }

  return best;
}

function initTTS() {
  stopTtsBtn.addEventListener('click', () => {
    window.speechSynthesis.cancel();
    ttsStatusOverlay.classList.add('hidden');
  });

  if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => {
      selectedMandarinVoice = pickBestMandarinVoice();
    };
    selectedMandarinVoice = pickBestMandarinVoice();
  }
}

function speakText(text) {
  if (!('speechSynthesis' in window)) {
    console.warn('当前浏览器不支持 Web Speech Synthesis');
    return;
  }

  // Stop any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.05; // 稍微调优语速，更接近自然对话
  utterance.pitch = 1.0;

  // 一次选定，始终沿用固定的普通话自然声音
  if (!selectedMandarinVoice) {
    selectedMandarinVoice = pickBestMandarinVoice();
  }

  if (selectedMandarinVoice) {
    utterance.voice = selectedMandarinVoice;
  }

  utterance.onstart = () => {
    ttsStatusOverlay.classList.remove('hidden');
  };

  utterance.onend = () => {
    ttsStatusOverlay.classList.add('hidden');
  };

  utterance.onerror = () => {
    ttsStatusOverlay.classList.add('hidden');
  };

  window.speechSynthesis.speak(utterance);
}

// ----------------------------------------------------
// 6. Markdown Export
// ----------------------------------------------------
function exportDebateMarkdown() {
  if (chatHistory.length === 0) return;

  const now = new Date();
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  
  let mdContent = `# 财政学 AI 语音辩论记录\n\n`;
  mdContent += `- **辩论角色**：${ROLE_CONFIGS[currentRole].name}\n`;
  mdContent += `- **生成时间**：${dateStr}\n`;
  if (uploadedFileName) {
    mdContent += `- **参考附件**：${uploadedFileName}\n`;
  }
  if (currentRole === 'custom') {
    mdContent += `- **角色设定提示词**：${customRolePrompt}\n`;
  }
  mdContent += `\n---\n\n`;

  chatHistory.forEach(msg => {
    const speaker = msg.role === 'user' ? '**学生**' : `**${ROLE_CONFIGS[currentRole].name}**`;
    mdContent += `${speaker}：${msg.content}\n\n`;
  });

  mdContent += `---\n*本记录由财政学 AI 语音辩论助教工具自动生成*\n`;

  // Download blob file
  const blob = new Blob([mdContent], { type: 'text/markdown;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `财政学辩论记录_${ROLE_CONFIGS[currentRole].name}_${now.toISOString().slice(0, 10)}.md`;
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
