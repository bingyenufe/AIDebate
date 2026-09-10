# 双模式（对辩/教辅）与三平台模型选择 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 网页入口先选「对辩/教辅」模式与三平台模型；对辩界面保持现状，教辅为小学生提供文字输入 + 图片上传 + 语音播报的新界面。

**Architecture:** 纯 Vanilla JS 前端（无框架、无构建），Vercel Serverless 后端。新增 `lib/model-registry.js` 作为模型能力表唯一维护点，`api/chat.js` 按 `modelId` 路由到三家 OpenAI 兼容端点，`api/models.js` 向前端暴露能力表。图片仅当轮以视觉格式发送，历史中存占位符。

**Tech Stack:** HTML/CSS/Vanilla JS、Vercel Functions（Node ESM）、`node:test` 内置测试器（零依赖）、Edge-TTS（现有）。

**设计文档:** `docs/superpowers/specs/2026-09-10-dual-mode-and-model-selection-design.md`（需求以此为准）

## Global Constraints

- 对辩模式的角色提示词、字数限制、录音/上传/TTS 行为**完全不动**（用户明确要求）
- 不得修改 `app/`（Android）与 `debug_tool/` 目录
- `modelId` 合法值固定为：`qwen-flash` | `deepseek-flash` | `glm-flash`，后端不静默回退旧模型
- sessionStorage 键名：`aidebate_mode`、`aidebate_model`；刷新页面总是回到入口层重选
- 教辅字数：一年级助教 ≤45 字（maxTokens 200）、十万个为什么 ≤30 字（maxTokens 160）；教辅自定义角色字数默认 60、范围 10~200
- 教辅 TTS 统一 `zh-CN-XiaoxiaoNeural`（现有 `speakText()` 默认值，无需改动）
- 图片：仅 JPEG/PNG/WebP，原始 ≤10MB，限 1 张；canvas 压缩最长边 ≤1280px、JPEG 质量 0.8；仅发送当轮对模型可见，历史占位符文本为「[已发送图片]」
- 有图片时允许空文本，前端以「请看一看这张图片并回答问题」作为 text 发送
- 新增环境变量：`DASHSCOPE_API_KEY`、`DEEPSEEK_API_KEY`、`ZHIPU_API_KEY`（部署时在 Vercel 配置，代码不提供 .env 文件）
- 前端 DOM 逻辑无自动化测试框架（仓库现状，不引入 jsdom，YAGNI），以 `npm run dev` 手动验证；后端用 `node:test`

---

### Task 1: 模型注册表与 /api/models 端点

**Files:**
- Create: `lib/model-registry.js`
- Create: `api/models.js`
- Test: `tests/models-handler.test.js`
- Modify: `package.json`（仅加 test script）

**Interfaces:**
- Produces: `MODEL_REGISTRY`（对象，键为 modelId，值 `{ label, provider, url, keyEnv, model, vision }`），Task 2 的 `api/chat.js` 导入消费
- Produces: `GET /api/models` → `{ models: [{ id, label, provider, vision, keyConfigured }] }`，Task 3 前端消费

- [ ] **Step 1: 写失败测试**

创建 `tests/models-handler.test.js`：

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/models.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

test('GET /api/models 返回三个模型及 keyConfigured 状态', async () => {
  process.env.DASHSCOPE_API_KEY = 'test-dash';
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ZHIPU_API_KEY = 'test-glm';

  const res = mockRes();
  await handler({ method: 'GET' }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.models.map(m => m.id), ['qwen-flash', 'deepseek-flash', 'glm-flash']);
  const byId = Object.fromEntries(res.body.models.map(m => [m.id, m]));
  assert.equal(byId['qwen-flash'].keyConfigured, true);
  assert.equal(byId['deepseek-flash'].keyConfigured, false);
  assert.equal(byId['glm-flash'].vision, true);
  assert.equal(byId['glm-flash'].label, 'glm-5.3-flash');
});

test('非 GET 请求返回 405', async () => {
  const res = mockRes();
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/models-handler.test.js`
Expected: FAIL（`Cannot find module '../api/models.js'`）

- [ ] **Step 3: 实现 `lib/model-registry.js`**

```js
// 模型能力表 —— 全项目唯一维护点。
// vision 标志表示模型是否原生支持图片输入（用户已确认三个模型均为多模态）。
// 若后续实测或换模型，只改这里，api/chat.js 与前端自动生效。
export const MODEL_REGISTRY = {
  'qwen-flash': {
    label: 'qwen3.8-flash',
    provider: '阿里云百炼',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    keyEnv: 'DASHSCOPE_API_KEY',
    model: 'qwen3.8-flash',
    vision: true,
  },
  'deepseek-flash': {
    label: 'deepseek-flash',
    provider: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-flash',
    vision: true,
  },
  'glm-flash': {
    label: 'glm-5.3-flash',
    provider: '智谱GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    keyEnv: 'ZHIPU_API_KEY',
    model: 'glm-5.3-flash',
    vision: true,
  },
};
```

- [ ] **Step 4: 实现 `api/models.js`**

```js
import { MODEL_REGISTRY } from '../lib/model-registry.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const models = Object.entries(MODEL_REGISTRY).map(([id, m]) => ({
    id,
    label: m.label,
    provider: m.provider,
    vision: m.vision,
    keyConfigured: Boolean(process.env[m.keyEnv]),
  }));

  return res.status(200).json({ models });
}
```

- [ ] **Step 5: 加 test script（package.json scripts 节点改为）**

```json
"scripts": {
  "dev": "vercel dev",
  "test": "node --test tests/"
}
```

- [ ] **Step 6: 运行确认通过**

Run: `npm test`
Expected: PASS（2 个测试通过）

- [ ] **Step 7: Commit**

```bash
git add lib/model-registry.js api/models.js tests/models-handler.test.js package.json
git commit -m "feat: 模型能力表与 /api/models 端点（三平台注册表）"
```

---

### Task 2: api/chat.js 模型路由 + 教辅角色 + 视觉消息构造

**Files:**
- Modify: `api/chat.js`（整文件替换，见 Step 3）
- Test: `tests/chat-handler.test.js`

**Interfaces:**
- Consumes: `MODEL_REGISTRY`（Task 1）
- Produces: `/api/chat` 请求体新增字段 `modelId`（string）、`imageDataUrl`（string, dataURL，可选）；`roleType` 新增合法值 `first_grade`、`whys`。Task 4/5 前端按此发送

注意：`first_grade`/`whys` 的提示词移植自 Android `app/app/src/main/java/com/aidebate/realtime/MainActivity.kt` 的 `buildRolePrompt()`，唯一适配：App 第 6 条「纯音频口语作答，默认不输出文本」在网页（文字+TTS）语境下会误导模型，改为「不输出格式符号」。字数规则原样保留。

- [ ] **Step 1: 写失败测试**

创建 `tests/chat-handler.test.js`：

```js
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { MODEL_REGISTRY } from '../lib/model-registry.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

function okFetch(content = 'AI 回复') {
  return async (url, opts) => {
    globalThis.__capturedFetch = { url, body: JSON.parse(opts.body), headers: opts.headers };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };
}

function baseBody(overrides = {}) {
  return {
    messages: [{ role: 'user', content: '你好' }],
    roleType: 'socrates',
    modelId: 'qwen-flash',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.DASHSCOPE_API_KEY = 'dash-key';
  process.env.DEEPSEEK_API_KEY = 'ds-key';
  process.env.ZHIPU_API_KEY = 'glm-key';
  globalThis.__capturedFetch = null;
});

test('modelId 缺失返回 400', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: undefined }) }, res);
  assert.equal(res.statusCode, 400);
});

test('未知 modelId 返回 400', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: 'gpt-9' }) }, res);
  assert.equal(res.statusCode, 400);
});

test('平台 Key 未配置返回 400 并提示环境变量名', async () => {
  delete process.env.DEEPSEEK_API_KEY;
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: 'deepseek-flash' }) }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /DEEPSEEK_API_KEY/);
});

test('按 modelId 路由到正确平台与模型名', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: 'glm-flash' }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(globalThis.__capturedFetch.url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
  assert.equal(globalThis.__capturedFetch.body.model, 'glm-5.3-flash');
  assert.equal(globalThis.__capturedFetch.headers.Authorization, 'Bearer glm-key');
  assert.equal(res.body.reply, 'AI 回复');
});

test('带图消息：最后一条 user 消息转为视觉格式', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({
    method: 'POST',
    body: baseBody({
      messages: [
        { role: 'user', content: '第一轮' },
        { role: 'assistant', content: '第一轮回复' },
        { role: 'user', content: '这道题怎么算？' },
      ],
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    }),
  }, res);
  const msgs = globalThis.__capturedFetch.body.messages;
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content[0].type, 'image_url');
  assert.equal(last.content[0].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.equal(last.content[1].type, 'text');
  assert.equal(last.content[1].text, '这道题怎么算？');
  // 历史消息不受影响
  assert.equal(msgs[0].content, '第一轮');
});

test('vision=false 的模型收到图片返回 400（守卫）', async () => {
  const orig = MODEL_REGISTRY['qwen-flash'].vision;
  MODEL_REGISTRY['qwen-flash'].vision = false;
  try {
    const res = mockRes();
    await handler({ method: 'POST', body: baseBody({ imageDataUrl: 'data:image/jpeg;base64,AAAA' }) }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /不支持图片/);
  } finally {
    MODEL_REGISTRY['qwen-flash'].vision = orig;
  }
});

test('first_grade 教辅角色：提示词含 45 字限制，maxTokens=200', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ roleType: 'first_grade' }) }, res);
  const sys = globalThis.__capturedFetch.body.messages[0].content;
  assert.match(sys, /一年级/);
  assert.match(sys, /45 字以内/);
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 200);
});

test('whys 教辅角色：提示词含 30 字限制，maxTokens=160', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ roleType: 'whys' }) }, res);
  const sys = globalThis.__capturedFetch.body.messages[0].content;
  assert.match(sys, /十万个为什么/);
  assert.match(sys, /30 字以内/);
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 160);
});

test('对辩角色不回归：socrates 走新模型且提示词保持 80 字', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ roleType: 'socrates', modelId: 'deepseek-flash' }) }, res);
  const sys = globalThis.__capturedFetch.body.messages[0].content;
  assert.match(sys, /苏格拉底/);
  assert.match(sys, /80 字以内/);
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 180);
  assert.equal(globalThis.__capturedFetch.body.model, 'deepseek-flash');
});
```

- [ ] **Step 2: 运行确认失败**

Run: `node --test tests/chat-handler.test.js`
Expected: FAIL（modelId 相关行为未实现，多个断言失败）

- [ ] **Step 3: 整文件替换 `api/chat.js`**

```js
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
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('Chat API Error:', data);
      return res.status(response.status).json({ error: data.message || 'LLM 对话服务异常' });
    }

    const reply = data.choices && data.choices[0] ? data.choices[0].message.content : '';
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'LLM 处理失败: ' + error.message });
  }
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: PASS（Task 1 的 2 个 + 本任务 9 个测试全部通过）

- [ ] **Step 5: Commit**

```bash
git add api/chat.js tests/chat-handler.test.js
git commit -m "feat: chat 按模型路由三平台，新增教辅角色与视觉消息构造"
```

---

### Task 3: 前端入口层与双模式 DOM/样式/切换

**Files:**
- Modify: `index.html`（入口层 overlay、教辅侧栏、教辅输入区、重选按钮、既有容器补 id）
- Modify: `app.js`（新增第 7 节「Mode & Model Entry Layer」；DOMContentLoaded 增加 initEntryOverlay）
- Modify: `style.css`（追加入口层与教辅样式）

**Interfaces:**
- Consumes: `GET /api/models`（Task 1）
- Produces: 全局状态 `currentMode`（null|'debate'|'tutor'）、`currentModelId`（string）；函数 `applyMode()`、`returnToEntry()`、`resetConversation()`（既有）。Task 4/5 在此状态上接线
- 本任务完成后：教辅界面可见、可切角色、可打字，但「发送」按钮保持 disabled（接线在 Task 4）

- [ ] **Step 1: index.html —— body 开头（`<div class="app-container">` 之前）插入入口层**

```html
  <!-- Mode & Model Selection Entry Layer -->
  <div id="modeSelectOverlay" class="mode-select-overlay">
    <div class="mode-select-card">
      <div class="mode-select-icon">🏛️</div>
      <h1>财政学 AI 课堂</h1>
      <p class="mode-select-desc">请选择使用模式与 AI 模型</p>

      <div class="mode-select-section">
        <h2>1️⃣ 选择模式</h2>
        <div class="mode-grid">
          <div class="mode-card" data-mode="debate">
            <div class="mode-icon">⚔️</div>
            <h3>学术对辩</h3>
            <p>财政学辩论课堂：苏格拉底 · 反方辩友 · 研讨伙伴 · Proposal 审查</p>
          </div>
          <div class="mode-card" data-mode="tutor">
            <div class="mode-icon">🎒</div>
            <h3>小学教辅</h3>
            <p>一年级助教 · 十万个为什么 · 自定义角色<br>（文字输入 · 看图回答 · 语音播报）</p>
          </div>
        </div>
      </div>

      <div class="mode-select-section">
        <h2>2️⃣ 选择模型</h2>
        <div id="modelGrid" class="model-grid"></div>
      </div>

      <button id="enterModeBtn" class="btn btn-primary" disabled>进入课堂</button>
    </div>
  </div>
```

- [ ] **Step 2: index.html —— 既有侧栏与输入区包壳补 id**

`<aside class="sidebar">` 改为 `<aside id="debateSidebar" class="sidebar">`；
`<div class="input-controls-area">` 改为 `<div id="inputControlsArea" class="input-controls-area">`。

- [ ] **Step 3: index.html —— chat-header 的 chat-actions 内加重选按钮**

```html
          <div class="chat-actions">
            <button id="backToModeBtn" class="btn btn-secondary btn-sm hidden">← 重选</button>
            <button id="endDebateBtn" class="btn btn-danger btn-sm hidden">
              🏁 结束辩论并听取总结
            </button>
          </div>
```

- [ ] **Step 4: index.html —— `<aside id="debateSidebar">` 之后插入教辅侧栏**

```html
      <!-- Tutor Sidebar (hidden until tutor mode selected) -->
      <aside id="tutorSidebar" class="sidebar hidden">
        <!-- Section 1: Tutor Role Selection -->
        <section class="card role-section">
          <h2>1. 选择学习伙伴</h2>
          <div class="role-grid">
            <div class="role-card tutor-role active" data-role="first_grade">
              <div class="role-icon">🎒</div>
              <div class="role-info">
                <h3>一年级助教</h3>
                <p>温柔引导 · 自己思考出答案</p>
              </div>
            </div>
            <div class="role-card tutor-role" data-role="whys">
              <div class="role-icon">🌟</div>
              <div class="role-info">
                <h3>十万个为什么</h3>
                <p>生活小比喻 · 讲解自然科学</p>
              </div>
            </div>
            <div class="role-card tutor-role" data-role="custom">
              <div class="role-icon">✏️</div>
              <div class="role-info">
                <h3>自定义角色</h3>
                <p>自由设定伙伴身份与回复字数</p>
              </div>
            </div>
          </div>
        </section>

        <!-- Tutor Guidance Card -->
        <section class="card instruction-section">
          <h2><span id="tutorInstructionTitle">🎒 一年级助教</span> 使用说明</h2>
          <p id="tutorInstructionText" class="instruction-desc">
            请把问题直接打字输入下方文本框，按回车或点「发送」。温柔助教会一步步引导你自己思考，不直接给答案。答对了会表扬你哦！
          </p>
        </section>

        <!-- Tutor Custom Role Setup (Hidden by default) -->
        <section id="tutorCustomPanel" class="card custom-role-section hidden">
          <h2>设定自定义伙伴</h2>
          <div class="form-group">
            <label for="tutorCustomPromptInput">请输入 AI 伙伴的身份与风格提示词：</label>
            <textarea id="tutorCustomPromptInput" placeholder="例如：你是一位温柔的语文老师，喜欢用童话故事讲解知识。"></textarea>
          </div>
          <div class="form-group">
            <label for="tutorWordCountInput">每次回复的字数上限 (10~200 字)：</label>
            <input type="number" id="tutorWordCountInput" min="10" max="200" value="60">
            <span class="field-tip">回答会简短一些，更适合小朋友听。</span>
          </div>
          <button id="saveTutorCustomBtn" class="btn btn-primary btn-sm">确认角色设定</button>
        </section>

        <!-- Section 2: Image Upload -->
        <section class="card upload-section">
          <h2>2. 上传题目图片 (可选)</h2>
          <p class="upload-tip">支持上传一张 JPG / PNG / WebP 图片（≤10MB），AI 将看图回答。不支持 PDF/Word 等文档。</p>
          <div class="file-upload-box">
            <input type="file" id="imageInput" accept="image/jpeg,image/png,image/webp">
            <label for="imageInput" class="file-dropzone" id="imageDropzone">
              <span class="upload-icon">📷</span>
              <span id="imageUploadStatusText">点击上传题目图片</span>
            </label>
          </div>
        </section>
      </aside>
```

- [ ] **Step 5: index.html —— ttsStatusOverlay 之后、inputControlsArea 之前插入教辅输入区**

```html
        <!-- Tutor Text Input Area (hidden until tutor mode selected) -->
        <div id="tutorInputArea" class="input-controls-area hidden">
          <div id="tutorImageStrip" class="tutor-image-strip hidden">
            <img id="tutorPendingThumb" class="image-thumb" alt="待发送图片预览">
            <span class="tutor-image-tip">图片将随下一条消息一起发送</span>
            <button id="removeImageBtn" class="btn-icon" title="移除图片">&times;</button>
          </div>
          <div class="tutor-input-bar">
            <textarea id="tutorTextInput" class="tutor-text-input" rows="2" placeholder="在这里输入问题，按回车发送"></textarea>
            <button id="tutorSendBtn" class="btn btn-primary btn-submit" disabled>发送 ⏎</button>
          </div>
        </div>
```

- [ ] **Step 6: app.js —— 文件顶部状态区（第 5 行 `let uploadedFileName = '';` 之后）追加**

```js
// Mode & model state (set on entry layer, see section 7)
let currentMode = null; // null | 'debate' | 'tutor'
let currentModelId = '';
let availableModels = [];
```

- [ ] **Step 7: app.js —— DOM 引用区（第 49 行 submitDebateBtn 之后）追加**

```js
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
```

- [ ] **Step 8: app.js —— 第 91-98 行 DOMContentLoaded 中 `initPasswordModal();` 之后加一行**

```js
  initEntryOverlay();
```

- [ ] **Step 9: app.js —— 文件末尾（escapeHtml 函数之后）追加第 7 节**

```js
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
  currentMode = null;
  resetConversation();
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
```

- [ ] **Step 10: app.js —— 修改 resetConversation 欢迎语（约第 203-211 行 chatMessages.innerHTML 模板）**

将现有 `chatMessages.innerHTML = ...` 整段替换为按模式区分：

```js
  let welcomeHtml;
  if (currentMode === 'tutor') {
    welcomeHtml = `<strong>已切换至「${TUTOR_ROLE_CONFIGS[currentRole].name}」，请直接打字提问。</strong>`;
  } else {
    welcomeHtml = `<strong>已切换至「${ROLE_CONFIGS[currentRole].name}」角色对话！</strong><p>请录制你的发问或立场表达，随后点击「提交发问」。</p>`;
  }
  chatMessages.innerHTML = `
    <div class="system-welcome-msg">
      <div class="welcome-icon">💡</div>
      <div>${welcomeHtml}</div>
    </div>
  `;
```

（说明：debate 分支与原视觉完全一致；tutor 分支不出现「录制」字样。）

- [ ] **Step 11: style.css —— 文件末尾追加入口层与教辅样式**

```css
/* ===================== Mode & Model Entry Layer ===================== */
.mode-select-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  z-index: 100000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  overflow-y: auto;
}

.mode-select-card {
  background: var(--panel-bg);
  border: 1px solid var(--panel-border);
  border-radius: 20px;
  padding: 32px 28px;
  max-width: 640px;
  width: 100%;
  text-align: center;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5), 0 0 35px rgba(245, 158, 11, 0.15);
  max-height: 92vh;
  overflow-y: auto;
}

.mode-select-icon {
  font-size: 3rem;
  margin-bottom: 8px;
}

.mode-select-card h1 {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text-main);
}

.mode-select-desc {
  font-size: 0.88rem;
  color: var(--text-muted);
  margin: 6px 0 20px;
}

.mode-select-section {
  margin-bottom: 20px;
  text-align: left;
}

.mode-select-section h2 {
  font-size: 0.95rem;
  color: var(--accent-gold);
  margin-bottom: 10px;
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mode-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-border);
  border-radius: 14px;
  padding: 18px 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.mode-card:hover {
  background: rgba(255, 255, 255, 0.07);
  transform: translateY(-1px);
}

.mode-card.active {
  background: var(--accent-gold-light);
  border-color: var(--accent-gold);
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.2);
}

.mode-icon {
  font-size: 2rem;
  margin-bottom: 6px;
}

.mode-card h3 {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4px;
}

.mode-card p {
  font-size: 0.76rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.model-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.model-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--panel-border);
  border-radius: 12px;
  padding: 12px 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  text-align: center;
}

.model-card:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.07);
}

.model-card.active {
  background: rgba(59, 130, 246, 0.18);
  border-color: var(--primary);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.25);
}

.model-card.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.model-provider {
  font-size: 0.72rem;
  color: var(--text-muted);
}

.model-name {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--text-main);
  margin: 3px 0;
  word-break: break-all;
}

.model-cap {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.model-load-error {
  grid-column: 1 / -1;
  font-size: 0.85rem;
  color: var(--danger);
  text-align: center;
  padding: 12px;
}

/* ===================== Tutor Mode ===================== */
.tutor-input-bar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}

.tutor-text-input {
  flex: 1;
  height: auto;
  min-height: 56px;
  font-size: 1rem;
  line-height: 1.5;
  resize: none;
}

.tutor-image-strip {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  padding: 8px 12px;
}

.tutor-image-tip {
  flex: 1;
  font-size: 0.78rem;
  color: var(--text-muted);
}

.image-thumb {
  width: 52px;
  height: 52px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid var(--panel-border);
  max-width: 100%;
}

@media (max-width: 768px) {
  .mode-grid {
    grid-template-columns: 1fr;
  }

  .model-grid {
    grid-template-columns: 1fr;
  }

  .tutor-input-bar {
    flex-direction: column;
    align-items: stretch;
  }
}
```

- [ ] **Step 12: 手动验证**

Run: `npm run dev`（vercel dev，默认 http://localhost:3000）

1. 打开首页 → 全屏入口层覆盖，无后台界面露出
2. 模型区渲染出 3 张卡（本地无环境变量 → 均显示「未配置该平台 Key」并置灰不可选）→ 这是预期
3. 选「学术对辩」+ 临时用浏览器 DevTools 执行 `document.querySelector('.model-card').classList.add('active')`（本地无可用 Key 时为验证流程放行）→ 点「进入课堂」→ 显示原有对辩界面，头部出现「← 重选」
4. 点「← 重选」→ confirm 后回到入口层
5. 选「小学教辅」进入 → 左侧为教辅三角色卡，右侧输入区为文本框（发送按钮 disabled），无录音按钮、无导出按钮
6. 切换「十万个为什么」→ 说明文字与聊天标签更新；选「自定义角色」→ 字数面板出现，输入 300 提示「10~200」
7. 刷新页面 → 回到入口层

- [ ] **Step 13: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: 入口层（模式/模型选择）与教辅界面 DOM、样式与切换"
```

---

### Task 4: 教辅文字对话流 + modelId 全局注入

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `currentMode`/`currentModelId`（Task 3）、`/api/chat` 的 `modelId` 与 `first_grade`/`whys` roleType（Task 2）
- Produces: 教辅纯文字对话端到端可用；`sendChatMessage` 请求体固定携带 `modelId`（对辩同样生效）；全局函数 `getRoleConfig()` 供 Task 5 复用

- [ ] **Step 1: 确认依赖变量已存在**

`tutorCustomPrompt` 与 `tutorWordCount` 已在 Task 3 Step 9 的第 7 节中定义（`let tutorCustomPrompt = ''; let tutorWordCount = 60;`），本任务直接使用，**不要重复定义**。

- [ ] **Step 2: app.js —— 新增 getRoleConfig 助手并替换所有 ROLE_CONFIGS 直接取用处**

在 ROLE_CONFIGS 定义之后追加：

```js
function getRoleConfig() {
  return currentMode === 'tutor' ? TUTOR_ROLE_CONFIGS[currentRole] : ROLE_CONFIGS[currentRole];
}
```

替换以下 4 处（行号为现状参考）：
- `updateRoleUI()` 内 3 处 `ROLE_CONFIGS[currentRole]` → `getRoleConfig()`（约 173-176 行）
- `resetConversation()` 欢迎语中（Task 3 Step 10 已改为按模式分支，确认无遗留）
- `appendMessageToFeed()` 内 `ROLE_CONFIGS[currentRole].name` → `getRoleConfig().name`（约 519 行）
- `exportDebateMarkdown()` 内 3 处 `ROLE_CONFIGS[currentRole]` → `getRoleConfig()`（约 600-622 行）

- [ ] **Step 3: app.js —— sendChatMessage 请求体加入 modelId（约第 463-471 行 body）**

```js
      body: JSON.stringify({
        messages: chatHistory.map(({ role, content }) => ({ role, content })),
        roleType: currentRole,
        customPrompt: currentMode === 'tutor' ? tutorCustomPrompt : customRolePrompt,
        customWordCount: currentMode === 'tutor' ? tutorWordCount : customWordCount,
        fileContent: uploadedFileContent,
        isEnd: isEnd,
        providedPassword: unlockedPassword,
        modelId: currentModelId
      }),
```

（注意：`messages` 改为解构映射——为 Task 5 的历史图片属性做隔离，纯文字场景行为不变。）

- [ ] **Step 4: app.js —— sendChatMessage 开头的自定义角色校验按模式分支（约第 440-443 行）**

```js
  if (currentRole === 'custom') {
    const hasPrompt = currentMode === 'tutor' ? !!tutorCustomPrompt : !!customRolePrompt;
    if (!hasPrompt) {
      alert('请先在左侧输入并保存自定义角色的提示词设定！');
      return;
    }
  }
```

- [ ] **Step 5: app.js —— 新增教辅发送函数与事件绑定（追加到第 7 节末尾）**

```js
function updateTutorSendState() {
  tutorSendBtn.disabled = isDebateEnded || tutorTextInput.value.trim().length === 0;
}

async function sendTutorMessage() {
  const text = tutorTextInput.value.trim();
  if (!text || isDebateEnded) return;
  if (currentRole === 'custom' && !tutorCustomPrompt) {
    alert('请先在左侧输入并保存自定义伙伴的提示词！');
    return;
  }
  tutorTextInput.value = '';
  updateTutorSendState();
  await sendChatMessage(text);
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
```

同时在 Task 3 Step 7 的 DOM 引用区补充：

```js
const tutorTextInput = document.getElementById('tutorTextInput');
const tutorSendBtn = document.getElementById('tutorSendBtn');
```

- [ ] **Step 6: app.js —— sendChatMessage 中状态提示文案按模式区分（约第 456-457 与 505-506 行）**

```js
  recStatusIcon.textContent = '💭';
  recStatusText.textContent = currentMode === 'tutor' ? 'AI 伙伴正在思考...' : 'AI 正在思考回应中...';
```

成功后：

```js
    recStatusIcon.textContent = '🎙️';
    recStatusText.textContent = currentMode === 'tutor' ? '可以继续提问' : '准备就绪，点击开始说话';
```

（教辅模式下该状态条不可见，仅为一致性；不额外处理。）

- [ ] **Step 7: 手动验证**

Run: `npm run dev`。为使 /api/chat 真实可调，本地设置一个平台 Key 后重启（PowerShell：`$env:DASHSCOPE_API_KEY='sk-xxx'; npm run dev`）。

1. 入口层：模型卡不再置灰，选「小学教辅」+ 任一模型 → 进入
2. 选「一年级助教」，输入「6+6等于几？」回车 → 气泡出现，AI 回复简短（≈45字内）且自动朗读
3. 连续追问 2-3 轮，历史正常滚动
4. 选「自定义角色」未保存提示词就发送 → alert 拦截；保存后可正常对话
5. 切到「学术对辩」→ 苏格拉底对话正常（回归验证，带 modelId 后不回归）
6. DevTools Network：/api/chat 请求体含 `modelId`，教辅 roleType 为 `first_grade`/`whys`/`custom`

- [ ] **Step 8: Commit**

```bash
git add app.js
git commit -m "feat: 教辅文字对话流与 modelId 全局注入"
```

---

### Task 5: 图片上传链路（压缩/附加/守卫/缩略图）

**Files:**
- Modify: `app.js`

**Interfaces:**
- Consumes: `/api/chat` 的 `imageDataUrl` 与视觉消息构造（Task 2）、`currentModelId`（Task 3）、`sendChatMessage`（Task 4）
- Produces: `compressImageFile(file) → Promise<string(dataURL)>`；教辅「图片+文字」端到端；历史图片仅显示不重发

- [ ] **Step 1: app.js —— 顶部状态区追加**

```js
let pendingImageDataUrl = '';
```

DOM 引用区追加：

```js
// Tutor image upload DOM
const imageInput = document.getElementById('imageInput');
const imageDropzone = document.getElementById('imageDropzone');
const imageUploadStatusText = document.getElementById('imageUploadStatusText');
const tutorImageStrip = document.getElementById('tutorImageStrip');
const tutorPendingThumb = document.getElementById('tutorPendingThumb');
const removeImageBtn = document.getElementById('removeImageBtn');
```

- [ ] **Step 2: app.js —— 新增压缩函数与上传处理（追加到第 7 节末尾）**

```js
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
```

- [ ] **Step 3: app.js —— sendTutorMessage 组装图片与守卫（替换 Task 4 Step 5 函数体中对应部分）**

```js
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
```

- [ ] **Step 4: app.js —— sendChatMessage 签名与请求体扩展（在 Task 4 Step 3 基础上）**

签名改为 `async function sendChatMessage(userText, isEnd = false, imageDataUrl = '')`；请求体增加一行：

```js
        modelId: currentModelId,
        imageDataUrl: imageDataUrl || undefined
```

用户消息入史与气泡（约第 450-454 行）改为：

```js
  if (!isEnd) {
    const historyEntry = { role: 'user', content: userText };
    if (imageDataUrl) historyEntry.imageUrl = imageDataUrl; // 仅用于气泡展示，不发给后端
    chatHistory.push(historyEntry);
    appendMessageToFeed('user', userText, imageDataUrl || null);
  }
```

- [ ] **Step 5: app.js —— appendMessageToFeed 支持缩略图（整体替换函数，约第 515-528 行）**

```js
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
```

- [ ] **Step 6: app.js —— updateTutorSendState 覆盖图片待发态（替换 Task 4 Step 5 中的同名函数）**

```js
function updateTutorSendState() {
  const hasText = tutorTextInput.value.trim().length > 0;
  tutorSendBtn.disabled = isDebateEnded || (!hasText && !pendingImageDataUrl);
}
```

（Task 4 Step 5 中 `initTutorInput` 内两处调用无需改动，函数名一致。）

- [ ] **Step 7: app.js —— resetConversation 清空待发图片**

在 `resetConversation()` 函数体内（`isDebateEnded = false;` 之后）追加：

```js
  if (typeof setPendingImage === 'function') setPendingImage('');
```

- [ ] **Step 8: style.css —— 追加消息图片样式（紧跟 Task 3 Step 11 的教辅样式块）**

```css
.msg-image {
  max-width: 200px;
  max-height: 160px;
  border-radius: 12px;
  border: 1px solid var(--panel-border);
  margin-bottom: 6px;
  display: block;
}
```

- [ ] **Step 9: 手动验证**

Run: `npm run dev`（带平台 Key）

1. 教辅任一角色 → 上传一张 JPG 题目图 → 输入区上方出现缩略图条（可 × 移除）
2. 不打字直接「发送」→ 发送成功，气泡中显示图片 + 默认引导语，AI 针对图片内容回复并朗读
3. 再发一条纯文字追问（如「为什么？」）→ DevTools Network 检查请求体：`imageDataUrl` 为 undefined，messages 中上一轮 user content 为「[已发送图片]\n…」或纯文字（前端历史只存文字），**无 base64 重发**
4. 上传 15MB 图片 → alert「不能超过 10MB」；上传 .pdf → alert「仅支持 JPG/PNG/WebP」
5. 对辩模式回归：录音、Proposal 附件上传、结束辩论总结均正常（图片逻辑未侵入 debate 路径）
6. 手机宽度（DevTools 375px）：教辅输入区纵向堆叠正常

- [ ] **Step 10: Commit**

```bash
git add app.js style.css
git commit -m "feat: 教辅图片上传压缩、视觉守卫与消息缩略图"
```

---

### Task 6: 全量验收走查

**Files:**
- 无新改动（仅按设计文档 §⑧ 验收清单走查；发现问题就地小修并单独 commit）

**Interfaces:**
- Consumes: 前述全部任务交付物；`docs/superpowers/specs/2026-09-10-dual-mode-and-model-selection-design.md` §⑧

- [ ] **Step 1: 配置三个平台 Key 后启动 `npm run dev`**
- [ ] **Step 2: 执行验收清单（设计文档 §⑧ 共 7 项）**

1. 3 模型 × 2 模式各一轮对话冒烟（6 组合）
2. 教辅带图提问 + 下一轮纯文本追问（占位符生效，无 base64 重发）
3. 「← 重选」返回：历史清空、可换模式/模型重进
4. 删除某平台 Key 重启：入口页该平台置灰；直接 curl `/api/chat` 返回 400 且文案含环境变量名
5. 额度弹窗：临时把 `DAILY_LIMIT=2` 重启，第 3 次对话两种模式均弹密码框，输入 `ADMIN_PASSWORD` 解锁恢复
6. 375px 宽度：入口层与教辅界面布局正常
7. 对辩全回归：录音分段转写、Proposal 附件审查、结束辩论总结、TTS 朗读

- [ ] **Step 3: 最终提交**

```bash
git add -A
git commit -m "chore: 双模式改造验收走查通过"
```

（若走查无任何修改，则此步无提交，直接结束。）
