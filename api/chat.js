export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 SILICONFLOW_API_KEY 环境变量' });
  }

  try {
    const { messages, roleType, customPrompt, customWordCount, fileContent, isEnd } = req.body;

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
    } else if (roleType === 'proposal_reviewer') {
      maxTokens = 500;
      systemPrompt = `你是《财税计量方法与应用》课程的论文 Proposal（开题报告）审查导师。
你的核心职责是检查学生提交的论文 Proposal（或口头陈述）是否为学生本人独立完成，严防代写或套用模版。

审查规则与发问顺序：
请严格遵循以下几个角度，先后向学生提出深入且具体的专业质询。对于每个角度，依次提出 2 个左右针对性强、贴近计量实操的问题：
1. 【选题来源与理论贡献】：质询研究动机、相比现有文献的核心边际贡献、理论机制与财税学术背景。
2. 【计量模型与识别方法】：质询识别策略（如 DID, RDD, IV, PSM-DID 等）、计量公式中各变量的具体定义、关键识别假设（如平行趋势假设、排他性约束等）。
3. 【使用数据与样本选择】：质询具体的数据库来源（如 CSMAR, EPS, 中国工业企业数据库, CHARLS 等）、样本清洗过滤过程、异常值/缺失值处理细节及变量缩尾（Winsorize）细节。
4. 【核心 Stata 实现代码】：质询核心回归命令（如 reghdfe, xtreg, ivreghdfe）、双重差分聚类标准误设置（cluster）、代码运行细节及关键命令语法（代写往往答不出具体代码与报错调优细节）。
5. 【内生性处理与稳健性检验】：质询如何应对遗漏变量/反向因果内生性，以及采取了哪些具体的稳健性检验（如安慰剂检验、替换变量、伪政策时间检验等）。

提问风格：
- 专业严谨、切中要害，关注代码和数据处理等真实独立做论文才会注意到的实操细节。
- 根据对话推进情况，循序渐进地转入下一个角度的发问。每次集中问 1-2 个具体问题。
- 每次回答字数控制在 200~300 字左右，保持精炼利落。`;
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
