export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 SILICONFLOW_API_KEY 环境变量' });
  }

  try {
    const { messages, roleType, customPrompt, fileContent, isEnd } = req.body;

    let systemPrompt = '';
    let maxTokens = 250;

    // Build system prompts based on selected role
    if (roleType === 'socrates') {
      maxTokens = 150;
      systemPrompt = `你是苏格拉底，古希腊哲学家。你的任务是通过提问帮助学生深入审视自己的观点，而非直接反驳或给出答案。

规则：
1. 每次只提出一个核心追问问题，简洁有力。
2. 聚焦于学生观点中的假设、前提、概念混淆或逻辑漏洞。
3. 语气使用苏格拉底式发问，例如"你所说的……是否意味着……？"
4. 严格控制在 80 字以内（口语篇幅约20秒），像正常口语交流，绝不做长篇大论演讲。
5. 鼓励学生深入思考财政学背后的逻辑与价值观。`;
    } else if (roleType === 'opponent') {
      maxTokens = 280;
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
    } else {
      // Custom role
      maxTokens = 230;
      systemPrompt = `${customPrompt || '你是一位专业的财政学学者，正在与学生讨论问题。'}

规则：
1. 保持角色一致性与专业视角。
2. 每次回答严格控制在 150 字以内，精炼集中，适合口语语音朗读。`;
    }

    // Append file content reference if present
    if (fileContent && fileContent.trim()) {
      systemPrompt += `\n\n以下是用户上传的参考背景材料，请在回应时适当结合或作为反驳/发问的参考依据：\n---\n${fileContent.slice(0, 8000)}\n---`;
    }

    const fullMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'deepseek-ai/DeepSeek-V3',
        messages: fullMessages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('SiliconFlow Chat API Error:', data);
      return res.status(response.status).json({ error: data.message || 'LLM 对话服务异常' });
    }

    const reply = data.choices && data.choices[0] ? data.choices[0].message.content : '';
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Chat API Error:', error);
    return res.status(500).json({ error: 'LLM 处理失败: ' + error.message });
  }
}
