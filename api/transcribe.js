export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.SILICONFLOW_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '服务端未配置 SILICONFLOW_API_KEY 环境变量' });
  }

  try {
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const bodyBuffer = Buffer.concat(chunks);
    const contentType = req.headers['content-type'];

    // Forward the raw multipart audio payload directly to SiliconFlow ASR endpoint
    const response = await fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': contentType,
      },
      body: bodyBuffer,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('SiliconFlow ASR Error:', data);
      return res.status(response.status).json({ error: data.message || '语音识别服务异常' });
    }

    return res.status(200).json({ text: data.text || '' });
  } catch (error) {
    console.error('Transcribe Error:', error);
    return res.status(500).json({ error: '语音识别处理失败: ' + error.message });
  }
}
