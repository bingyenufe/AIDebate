// 模型能力表 —— 全项目唯一维护点。
// vision 标志表示模型是否原生支持图片输入（用户已确认三个模型均为多模态）。
// bodyOptions 原样并入该平台的请求体（思考模式控制等平台差异只在此处维护）；
// minMaxTokens 为该平台输出预算下限——三家新平台均默认开启思考，
// 思考 token 与正文共享 max_tokens，预算太小会导致正文为空（2026-09-10 生产故障根因）。
// 若后续实测或换模型，只改这里，api/chat.js 与前端自动生效。
export const MODEL_REGISTRY = {
  'qwen-flash': {
    label: 'qwen3.8-flash',
    provider: '阿里云百炼',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    keyEnv: 'DASHSCOPE_API_KEY',
    model: 'qwen3.8-flash',
    vision: true,
    // qwen3.8 为混合模式、默认开启思考（effort=xhigh），显式关闭；minMaxTokens 为兜底。
    bodyOptions: { enable_thinking: false },
    minMaxTokens: 1024,
  },
  'deepseek-flash': {
    label: 'deepseek-flash',
    provider: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    keyEnv: 'DEEPSEEK_API_KEY',
    model: 'deepseek-flash',
    vision: true,
    // deepseek-flash 思考模式默认开启（effort=high），关闭后等同旧 deepseek-chat 非思考模式。
    bodyOptions: { thinking: { type: 'disabled' } },
    minMaxTokens: 1024,
  },
  'glm-flash': {
    label: 'glm-5.3-flash',
    provider: '智谱GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    keyEnv: 'ZHIPU_API_KEY',
    model: 'glm-5.3-flash',
    vision: true,
    // GLM-5.3 强制思考、无法关闭（传 disabled 会报错），只能降到 low 档并放宽预算。
    bodyOptions: { reasoning_effort: 'low' },
    minMaxTokens: 2048,
  },
};
