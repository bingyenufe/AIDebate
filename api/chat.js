import fs from 'fs';
import path from 'path';
import os from 'os';
import { MODEL_REGISTRY } from '../lib/model-registry.js';

async function checkAndIncrementDailyUsage() {
  const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const key = `daily_usage:${todayStr}`;
      const res = await fetch(`${upstashUrl}/incr/${key}`, {
        headers: { Authorization: `Bearer ${upstashToken}` }
      });
      const data = await res.json();
      if (typeof data.result === 'number') return data.result;
    } catch (e) {
      console.warn('Upstash Redis error, falling back to file counter:', e);
    }
  }

  // Fallback to local /tmp file counter
  try {
    const tmpFile = path.join(os.tmpdir(), `daily_usage_${todayStr}.json`);
    let count = 0;
    if (fs.existsSync(tmpFile)) {
      const content = fs.readFileSync(tmpFile, 'utf8');
      count = JSON.parse(content).count || 0;
    }
    count += 1;
    fs.writeFileSync(tmpFile, JSON.stringify({ count }));
    return count;
  } catch (e) {
    console.warn('Local file counter error:', e);
    return 1;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { messages, roleType, customPrompt, customWordCount, fileContent, isEnd, providedPassword, modelId, imageDataUrl } = req.body;

    const adminPassword = process.env.ADMIN_PASSWORD || 'finance2026';
    const dailyLimit = parseInt(process.env.DAILY_LIMIT, 10) || 500;

    // Check if valid admin password is provided to bypass rate limit
    const isUnlockedByPassword = providedPassword && providedPassword.trim() === adminPassword;

    if (!isUnlockedByPassword) {
      const currentUsage = await checkAndIncrementDailyUsage();
      if (currentUsage > dailyLimit) {
        return res.status(429).json({
          error: 'QUOTA_EXCEEDED',
          message: `今日全站公共免费额度（${dailyLimit}次）已达上限。如需继续使用，请输入教师解锁密码。`
        });
      }
    }

    // ---- 模型路由（三平台 OpenAI 兼容端点，能力表见 lib/model-registry.js）----
    const modelInfo = MODEL_REGISTRY[modelId];
    if (!modelInfo) {
      return res.status(400).json({ error: '未知或缺失的模型 ID，请刷新页面重新选择模型' });
    }
    const platformKey = process.env[modelInfo.keyEnv];
    if (!platformKey) {
      return res.status(400).json({ error: `${modelInfo.provider}平台未配置 API Key（环境变量 ${modelInfo.keyEnv}）` });
    }

    // 视觉守卫：能力表 vision=false 的模型不允许收图（正常配置不触发）
    if (imageDataUrl && !modelInfo.vision) {
      return res.status(400).json({ error: `当前模型（${modelInfo.label}）不支持图片输入` });
    }

    let systemPrompt = '';
    let maxTokens = 300;

    // Build system prompts based on selected role
    if (roleType === 'socrates') {
      maxTokens = 180;
      systemPrompt = `你是苏格拉底，古希腊哲学家。你的任务是通过提问帮助学生深入审视自己的观点，而非直接反驳或给出答案。

规则：
1. 每次只提出一个核心追问问题，简洁有力。
2. 聚焦于学生观点中的假设、前提、概念混淆或逻辑漏洞。
3. 语气使用苏格拉底式发问，例如"你所说的……是否意味着……？"
4. 严格控制在 80 字以内（口语篇幅约20秒），像正常口语交流，绝不做长篇大论演讲。
5. 鼓励学生深入思考财政学背后的逻辑与价值观。`;
    } else if (roleType === 'opponent') {
      maxTokens = 300;
      systemPrompt = `你是一位辩论赛中立场坚定的反方辩手，立场与用户完全相反。

规则：
1. 第一轮对话中，首先明确阐述你的反方立场。
2. 初始阶段坚持立场；如果学生提出了极为有力的财政学/公共经济学学术论据，你可以承认该论点部分合理，并适度调整（但不完全放弃）你的立场，体现真实辩论的交锋过程。
3. 优先从财政学、公共政治经济学视角提出反驳论据。
4. 语气坚定、学术严谨、尊重对手，决不进行人身攻击。
5. 每次回答严格控制在 180 字以内（口语篇幅约40-45秒），精炼集中，像正常口语交流。`;

      if (isEnd) {
        systemPrompt += `\n\n【注意：本次为辩论结束请求】请对整场辩论进行结构化总结，严格控制在180字以内，结构如下：
"经过这场辩论，你在[具体方面]的论据使我有所改变立场；但关于[具体方面]，我仍坚持……因为……"
如果完全未被说服，请如实说明理由。`;
      }
    } else if (roleType === 'collaborator') {
      maxTokens = 250; // 硬上限限死在 150 字左右
      systemPrompt = `你是一位理性、客观、严谨的财政学/经济学学术“研讨伙伴”（Thought Partner）。
你的核心任务是与学生进行平等的学术探索，帮助学生澄清概念、补充逻辑前提并共同推演机制。

原则与规则：
1. 【不盲从迎合】：不一味赞同或附和学生的观点，若学生表述中有逻辑混淆、概念不清或事实偏差，请直言指出并予以澄清。
2. 【不恶意刁难】：不从极端的反方立场为了挑刺而挑刺，也不进行无意义的反驳。
3. 【建构式协作】：站在学生同一侧，帮助学生补全忽略的边界条件、前置假设（如财政体制、市场结构、开放/封闭经济约束等）。
4. 【澄清与共同推演】：每次回答先梳理学生观点的核心，澄清核心概念，然后提出 1 个建构式的启发问题，引导学生一起把机制推向下一阶段。
5. 【硬性字数限制】：你的回答必须极其精炼，字数必须严格控制在 100~150 字以内（绝对不能超过 150 字），约 2~3 句话。严禁长篇大论，像即时口语对话一样直接、精练。`;
    } else if (roleType === 'proposal_reviewer') {
      maxTokens = 500;
      systemPrompt = `你是《财税计量方法与应用》课程的论文 Proposal（开题报告）审查导师。
你的核心职责是深入审查学生提交的 Proposal 论文附件，评估其学术严谨性、研究可行性与实际完成度。

审查规则与发问顺序：
请结合学生上传的 Proposal 论文材料，严格遵循以下几个角度，先后向学生提出深入且具体的专业质询。对于每个角度，依次提出 2 个左右针对性强、贴近计量实操的问题：
1. 【选题来源与理论贡献】：质询研究动机、相比现有文献的核心边际贡献、理论机制与财税学术背景。
2. 【计量模型与识别方法】：质询识别策略（如 DID, RDD, IV, PSM-DID 等）、计量公式中各变量的具体定义、关键识别假设（如平行趋势假设、排他性约束等）。
3. 【使用数据与样本选择】：质询具体的数据库来源（如 CSMAR, EPS, 中国工业企业数据库, CHARLS 等）、样本清洗过滤过程、异常值/缺失值处理细节及变量缩尾（Winsorize）细节。
4. 【核心 Stata 实现代码】：质询核心回归命令（如 reghdfe, xtreg, ivreghdfe）、双重差分聚类标准误设置（cluster）、代码运行细节及关键命令语法。
5. 【内生性处理与稳健性检验】：质询如何应对遗漏变量/反向因果内生性，以及采取了哪些具体的稳健性检验（如安慰剂检验、替换变量、伪政策时间检验等）。

提问风格：
- 专业严谨、切中要害，密切结合学生上传的 Proposal 内容，关注代码和数据处理等真实做论文的实操细节。
- 根据对话推进情况，循序渐进地转入下一个角度的发问。每次集中问 1-2 个具体问题。
- 每次回答字数控制在 200~300 字左右，保持精炼利落。`;
    } else if (roleType === 'first_grade') {
      // 教辅：移植自 Android MainActivity.kt，仅适配第 6 条（网页为文字+TTS，非纯音频）
      maxTokens = 200;
      systemPrompt = `你是专为 6 岁一年级小朋友设计的温柔助教。
【执行规则】：
1. 必须平缓温和、不可太快，保证小朋友跟得上。
2. 引导学生自己思考得出答案。不可直接给答案。
3. 保证回答深入浅出，可以使用一些生动有趣的生活小比喻。
4. 每次你回答只能表达一个观点，长度控制在两三句，字数控制在 45 字以内。
5. 一旦小朋友答对了，给予表扬并宣布本题通关结束，不可反复纠缠。
6. 像面对面聊天一样直接输出要说的话，不输出序号、标题或表情符号。`;
    } else if (roleType === 'whys') {
      // 教辅：移植自 Android MainActivity.kt，仅适配第 5 条（网页为文字+TTS，非纯音频）
      maxTokens = 160;
      systemPrompt = `你是面向 6 岁小朋友的“十万个为什么”趣味科普助手。
【执行规则】：
1. 必须平缓温和、不可太快，保证小朋友跟得上。
2. 用生动有趣的生活小比喻解释身边的自然科学秘密，严禁使用任何抽象深奥的科学术语。
3. 每次你回答只能表达一个观点，长度控制在一两句，字数控制在 30 字以内。
4. 适当给予鼓励/表扬，但不可每句话都含鼓励/表扬。
5. 像面对面聊天一样直接输出要说的话，不输出序号、标题或表情符号。`;
    } else {
      // Custom role
      const targetWordCount = Math.min(Math.max(parseInt(customWordCount, 10) || 200, 10), 500);
      // Ensure backend doesn't forcefully truncate text under 500 words
      maxTokens = Math.min(Math.ceil(targetWordCount * 1.8) + 120, 950);

      systemPrompt = `${customPrompt || '你是一位专业的财政学学者，正在与学生讨论问题。'}

规则与限制：
1. 保持角色一致性与专业视角。
2. 【字数硬性限制】：请严格将你的回复字数控制在 ${targetWordCount} 字以内（用户要求 ${targetWordCount} 字，绝对不超过 500 字上限）。`;
    }

    // 思考型模型：思考 token 与正文共享 max_tokens，预算过小会让正文为空
    if (modelInfo.minMaxTokens) {
      maxTokens = Math.max(maxTokens, modelInfo.minMaxTokens);
    }

    // Append file content reference if present
    if (fileContent && fileContent.trim()) {
      systemPrompt += `\n\n以下是用户上传的参考背景材料，请在回应时适当结合或作为反驳/发问的参考依据：\n---\n${fileContent.slice(0, 8000)}\n---`;
    }

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // 视觉消息构造：图片只在发送当轮对模型可见（前端历史中已存占位符）。
    // 仅替换最后一条 user 消息为 OpenAI 视觉格式。
    if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
      let lastUserIdx = -1;
      for (let i = fullMessages.length - 1; i >= 0; i--) {
        if (fullMessages[i].role === 'user') { lastUserIdx = i; break; }
      }
      if (lastUserIdx !== -1) {
        fullMessages[lastUserIdx] = {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: imageDataUrl } },
            { type: 'text', text: fullMessages[lastUserIdx].content }
          ]
        };
      }
    }

    const response = await fetch(modelInfo.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${platformKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelInfo.model,
        messages: fullMessages,
        max_tokens: maxTokens,
        temperature: 0.7,
        ...modelInfo.bodyOptions, // 平台差异（思考模式开关等）统一在 lib/model-registry.js 维护
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Chat API Error:', data);
      return res.status(response.status).json({ error: data.message || 'LLM 对话服务异常' });
    }

    const reply = data.choices && data.choices[0] ? data.choices[0].message.content : '';
    if (typeof reply !== 'string' || !reply.trim()) {
      // 空回复守卫：思考型模型预算不足时 content 为空（内容都在 reasoning_content 里）。
      // 绝不能静默返回空串——前端会插入空白气泡、不报错、不朗读。
      const fr = data.choices && data.choices[0] ? data.choices[0].finish_reason : 'no_choices';
      console.error('Empty reply:', modelInfo.label, fr, JSON.stringify(data).slice(0, 1000));
      return res.status(502).json({ error: `模型未返回文字内容（${modelInfo.label}，finish_reason=${fr}），请重试或切换模型` });
    }
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'LLM 处理失败: ' + error.message });
  }
}
