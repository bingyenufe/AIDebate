# 双模式改造（对辩 / 教辅）与三平台模型选择 — 设计文档

- 日期：2026-09-10
- 状态：已确认（用户逐节批准）
- 范围：网页端（根目录 `index.html` / `app.js` / `style.css` / `api/*.js`）。Android App 与 debug_tool **不在本次范围**，不做任何修改。对辩模式的角色提示词与字数限制**保持现状不动**。

## 背景与目标

现有网页是单一形态的财政学语音辩论课堂（角色：苏格拉底/反方辩友/研讨伙伴/Proposal 审查/自定义；语音输入 + 文字对话 + Edge-TTS 朗读；后端硬编码 SiliconFlow DeepSeek-V3）。

目标：

1. 进入网页先选**模式**：对辩（现有界面）或 教辅（面向小学生的新界面）。
2. 教辅：文字输入、可上传图片（不可上传 md/pdf 等文档）、输出仍为语音；角色为「一年级助教」「十万个为什么」「自定义角色」。
3. 两种模式均支持三平台模型选择：阿里云百炼 `qwen3.8-flash`、DeepSeek 平台 `deepseek-flash`、智谱 `glm-5.3-flash`。

## 已确认的关键决策

| 决策点 | 结论 |
|---|---|
| 模型选择位置 | **方案 A：入口页统一选择**。进入模式后不可改，头部「← 重选」返回入口页重进。理由：对辩界面须保持现状；教辅面向 6 岁儿童，界面内不出现技术选项；模型是会话级属性 |
| 图片与视觉能力 | 三个模型**均为多模态**（用户确认）。图片直接以 OpenAI 视觉格式发送，无需兜底转述 |
| 视觉拦截逻辑 | 保留为**防御性守卫**：由模型注册表 `vision` 标志驱动，若未来加入纯文本模型自动生效（上传放行、发送时阻止并提示换模型）。当前三模型 `vision: true`，守卫永不触发 |
| 教辅字数 | 一年级助教 ≤45 字、十万个为什么 ≤30 字，提示词移植 Android App `MainActivity.kt` 已验证版本，保持两端一致 |
| 会话存储 | `mode` 与 `model` 存 `sessionStorage`（键 `aidebate_mode` / `aidebate_model`），刷新回到入口页重选 |

## ① 入口页（新增）

打开 `index.html` 时显示全屏入口层（覆盖现有 `app-container`）：

- **模式选择**：两张大卡片
  - 「⚔️ 学术对辩」——财政学辩论课堂，进入后即当前界面
  - 「🎒 小学教辅」——一年级助教 · 十万个为什么 · 自定义角色
- **模型选择**：三张小卡片，默认选中 `qwen3.8-flash`；由 `/api/models` 渲染，`keyConfigured=false` 的平台置灰并提示「未配置该平台 Key」
- 「进入」按钮确认生效，缺一项选择则按钮置灰
- 入口层为纯前端状态层，不产生网络请求（模型卡片信息来自页面加载时的 `/api/models`）

## ② 对辩模式

界面、角色、字数、录音、文档上传、TTS 全部不变。改动仅两处：

- 请求体新增 `modelId` 字段
- 头部新增「← 重选」按钮：confirm 确认后清空会话（chatHistory、录音分段、上传附件）并返回入口页

## ③ 教辅模式（新）

- **角色三张卡**：`first_grade`（一年级助教）、`whys`（十万个为什么）、`custom`（自定义角色）
  - 一年级助教 / 十万个为什么的 systemPrompt 从 Android App `MainActivity.kt` 的 `buildRolePrompt()` 移植（含【执行规则】与 45/30 字限制）
  - 自定义角色复用现有面板：字数默认 60，范围 10~200，提示语适配教辅场景；`roleType` 仍传 `custom`，后端 custom 分支不变
- **输入区**：录音控件整体替换为大号文本框 + 发送按钮；Enter 发送、Shift+Enter 换行；无图片时空文本禁用发送，**已附加图片时允许空文本**（前端以默认引导语「请看一看这张图片并回答问题」作为 text 部分发送）
- **图片上传**：
  - `accept="image/jpeg,image/png,image/webp"`，限 1 张，待发送状态可移除
  - 前端 canvas 压缩：最长边 ≤1280px、JPEG 质量 0.8；原始文件 ≤10MB 校验；压缩失败则提示并中止
  - 发送消息时聊天流中显示缩略图
- **输出**：复用 `/api/tts`（Edge-TTS），教辅角色统一 `zh-CN-XiaoxiaoNeural`
- **裁剪**：无「结束辩论」按钮、无导出按钮、无录音相关 UI

## ④ 后端 `api/chat.js`：模型路由

新增模型注册表（三平台均为 OpenAI 兼容接口）：

```js
const MODEL_REGISTRY = {
  'qwen-flash':     { label: 'qwen3.8-flash',  provider: '阿里云百炼', url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyEnv: 'DASHSCOPE_API_KEY',  model: 'qwen3.8-flash',  vision: true },
  'deepseek-flash': { label: 'deepseek-flash', provider: 'DeepSeek',   url: 'https://api.deepseek.com/chat/completions',                          keyEnv: 'DEEPSEEK_API_KEY',   model: 'deepseek-flash', vision: true },
  'glm-flash':      { label: 'glm-5.3-flash',  provider: '智谱GLM',    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',              keyEnv: 'ZHIPU_API_KEY',      model: 'glm-5.3-flash',  vision: true },
};
```

- 请求体 `modelId` 缺失或不在注册表 → 400 错误（不静默回退到旧模型）
- 对应环境变量未配置 → 400「XX 平台未配置 API Key（DASHSCOPE_API_KEY）」
- 新增环境变量（Vercel 配置）：`DASHSCOPE_API_KEY`、`DEEPSEEK_API_KEY`、`ZHIPU_API_KEY`
- 新增教辅角色分支：`first_grade`（maxTokens 200）、`whys`（maxTokens 160），沿用现有「提示词字数 + maxTokens 硬刹车」风格
- 现有五个角色分支、额度计数、密码解锁逻辑全部不动

## ⑤ 图片消息构造

- 前端把压缩后的 dataURL 放在请求体 `imageDataUrl` 字段（与现有 `fileContent` 平级），`chatHistory` 中该轮只存文本 `「[已发送图片]」+ 文字`
- 服务端构造最终消息时，仅对**最后一轮 user 消息**替换为视觉格式：

```json
{ "role": "user", "content": [
  { "type": "image_url", "image_url": { "url": "<dataURL>" } },
  { "type": "text", "text": "<用户文字>" }
] }
```

- 效果：图片只在发送当轮对模型可见，历史轮次以占位符参与上下文，避免每轮重发 base64（费用与上下文长度）
- `vision=false` 的模型收到 `imageDataUrl` → 400「当前模型不支持图片输入」（服务端兜底守卫；前端已在发送前拦截，正常配置下两层均不触发）

## ⑥ 新增 `api/models.js`

`GET /api/models` 返回注册表公开视图：

```json
{ "models": [ { "id": "qwen-flash", "label": "qwen3.8-flash", "provider": "阿里云百炼", "vision": true, "keyConfigured": true } ] }
```

能力表唯一维护点；入口页卡片渲染与教辅守卫均以此为准。

## ⑦ 错误处理

- 非图片类型 / 原始文件 >10MB → 前端拒绝并提示
- canvas 压缩异常 → 提示并中止本次发送
- 平台 Key 未配置 → 400 明确文案（入口页即置灰预防）
- 上游 401 / 429 / 5xx → 透传简化错误信息，现有 `recStatusText` 展示
- TTS 失败 → 现有 `onerror` 静默降级，不影响文字回复展示
- 额度弹窗、密码解锁：全模式共用现有逻辑，不动

## ⑧ 验收清单

1. 3 模型 × 2 模式各完成一轮对话冒烟（6 组合）
2. 教辅带图提问：文字 + 图片同发，回复正常且朗读；下一轮纯文本追问正常（验证占位符生效）
3. 「← 重选」返回后历史清空、可换模式/换模型重进
4. 未配置 Key 的平台：入口页置灰；直接调 `/api/chat` 返回明确 400
5. 额度耗尽弹窗在两种模式下均正常弹出与解锁
6. 手机端（375px 宽）入口页与教辅界面布局正常
7. 对辩模式回归：录音、分段转写、Proposal 附件审查、结束辩论总结不受影响

## ⑨ 改动文件清单

| 文件 | 改动 |
|---|---|
| `index.html` | 入口页 overlay、教辅 DOM（角色卡/文本输入/图片上传）、「← 重选」按钮 |
| `app.js` | 模式与模型状态机、`/api/models` 拉取、教辅输入与图片压缩、教辅 ROLE_CONFIGS、守卫逻辑 |
| `style.css` | 入口页与教辅样式（复用现有卡片体系） |
| `api/chat.js` | 模型注册表与路由、教辅角色 prompts、`imageDataUrl` 视觉消息构造 |
| `api/models.js` | 新增 |
| Vercel 环境变量 | 新增 3 个平台 Key |
