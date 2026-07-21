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
    const audioBuffer = Buffer.concat(chunks);

    if (audioBuffer.length === 0) {
      return res.status(400).json({ error: '音频数据为空' });
    }

    const contentType = req.headers['content-type'] || 'audio/webm';
    
    // Construct standard FormData for SiliconFlow ASR API
    const audioBlob = new Blob([audioBuffer], { type: contentType });
    const formData = new FormData();
    formData.append('file', audioBlob, 'speech.webm');
    formData.append('model', 'FunAudioLLM/SenseVoiceSmall');

    const response = await fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    const resText = await response.text();
    let data;
    try {
      data = JSON.parse(resText);
    } catch (e) {
      console.error('SiliconFlow response is not JSON:', resText);
      return res.status(500).json({ error: '语音识别服务响应非JSON: ' + resText.slice(0, 100) });
    }

    if (!response.ok) {
      console.error('SiliconFlow ASR Error:', data);
      return res.status(response.status).json({ error: data.message || data.error || '语音识别服务异常' });
    }

    return res.status(200).json({ text: data.text || '' });
  } catch (error) {
    console.error('Transcribe Error:', error);
    return res.status(500).json({ error: '语音识别处理失败: ' + error.message });
  }
}

