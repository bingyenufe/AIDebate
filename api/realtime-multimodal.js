export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 DASHSCOPE_API_KEY 环境变量' });
  }

  try {
    const { messages, roleType, customPrompt, fileContent, imageBase64, password } = req.body || {};
    const adminPassword = process.env.ADMIN_PASSWORD || 'finance2026';

    if (!password || password.trim() !== adminPassword.trim()) {
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: '需要管理员密码' });
    }

    let systemPrompt = '';

    if (roleType === 'socrates') {
      systemPrompt = `你是古希腊哲学家苏格拉底。
【执行规则】：
1. 你的任务是通过追问帮助学生审视观点前提与漏洞，绝不直接给出答案。
2. 聚焦学生观点中的核心逻辑漏洞，每次只提出一个核心反问。
3. 像面对面即时口语交流，精炼聚焦，不做长篇演讲。
4. 纯音频口语作答，默认不输出文本。`;
    } else if (roleType === 'opponent') {
      systemPrompt = `你是一位辩论赛中立场坚定的学术反方辩友。
【执行规则】：
1. 持相反立场，从财政学与公共政治经济学角度提出核心反驳论据。
2. 当学生提出极具说服力的学术依据时，可适度承认局部合理并调整立场，体现真实辩论交锋。
3. 语气坚定严谨、尊重对手，集中火力反驳 1 个关键论据。
4. 像面对面对辩一样干脆紧凑，避免冗长陈述。
5. 纯音频口语作答，默认不输出文本。`;
    } else if (roleType === 'collaborator') {
      systemPrompt = `你是理性客观的财政学学术研讨伙伴。
【执行规则】：
1. 不迎合、不挑刺，站在学生同侧帮助澄清概念、补充前置假设。
2. 梳理核心机制后提出一个建构式的启发推演问题，共同推演机制。
3. 精炼直接，像面对面学术讨论一样紧凑。
4. 纯音频口语交流，默认不输出文本。`;
    } else if (roleType === 'first_grade_tutor') {
      systemPrompt = `你是专为 6 岁一年级小朋友设计的温柔助教。
【执行规则】：
1. 语速必须平缓温和、从容不迫，不可太快，充满耐心与鼓励。
2. 回答时先直接、明确地给出正确答案，再用一句简单的生活记法或表扬收尾。
3. 极其短小精炼，一气呵成，讲完即止，坚决杜绝长篇大论。
4. 纯音频亲切交流，默认不输出文本。`;
    } else if (roleType === 'hundred_thousand_whys') {
      systemPrompt = `你是面向 6 岁小朋友的“十万个为什么”趣味科普助手。
【执行规则】：
1. 语速必须平缓温和、从容不迫，不可太快，生动有趣。
2. 用生动有趣的生活小比喻解释身边的科学秘密，严禁使用任何抽象深奥的专业科学术语。
3. 极短篇幅，每次只挑一个最直观、最好玩的点讲透，讲完即止。
4. 纯音频生动讲解，默认不输出文本，启发孩子的好奇心。`;
    } else {
      systemPrompt = `${customPrompt || '你根据用户设定的身份与立场展开交流。'}
【执行规则】：
1. 忠实执行设定的身份与学术立场。
2. 保持专业一致性，以自然紧凑的口语化语气回应，杜绝长文宣读。
3. 纯音频口语作答，默认不输出文本。`;
    }

    if (fileContent && fileContent.trim()) {
      systemPrompt += `\n参考材料：${fileContent.slice(0, 3000)}`;
    }

    // Format messages for DashScope OpenAI-compatible API
    const formattedMessages = [
      { role: 'system', content: systemPrompt }
    ];

    if (Array.isArray(messages)) {
      for (const msg of messages) {
        formattedMessages.push(msg);
      }
    }

    // If an image is provided in the current turn
    if (imageBase64) {
      const lastUserMsgIndex = formattedMessages.map(m => m.role).lastIndexOf('user');
      const imageItem = {
        type: 'image_url',
        image_url: { url: imageBase64 }
      };

      if (lastUserMsgIndex >= 0) {
        const existingContent = formattedMessages[lastUserMsgIndex].content;
        if (typeof existingContent === 'string') {
          formattedMessages[lastUserMsgIndex].content = [
            imageItem,
            { type: 'text', text: existingContent || '请看这张图片' }
          ];
        } else if (Array.isArray(existingContent)) {
          formattedMessages[lastUserMsgIndex].content.unshift(imageItem);
        }
      } else {
        formattedMessages.push({
          role: 'user',
          content: [
            imageItem,
            { type: 'text', text: '请看这张图片并为我讲解。' }
          ]
        });
      }
    }

    const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'qwen3.5-omni-flash-realtime',
        messages: formattedMessages,
        max_tokens: (roleType === 'first_grade_tutor' || roleType === 'hundred_thousand_whys') ? 100 : 300,
        temperature: 0.7,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('DashScope Multimodal Error:', data);
      return res.status(response.status).json({
        error: data.message || (data.error && data.error.message) || 'DashScope 模型调用异常'
      });
    }

    const reply = data.choices && data.choices[0] ? data.choices[0].message.content : '';
    return res.status(200).json({ reply });
  } catch (error) {
    console.error('Multimodal API Error:', error);
    return res.status(500).json({ error: '多模态处理失败: ' + error.message });
  }
}
