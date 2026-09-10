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
