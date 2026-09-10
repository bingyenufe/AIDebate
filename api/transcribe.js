export const config = {
  api: {
    bodyParser: false,
  },
};

// 语音转写模型：换模型只改这一行。
// 2026-09-10 从免费的 FunAudioLLM/SenseVoiceSmall 换为付费的 Qwen3-ASR-1.7B——
// 免费模型限流固定且高峰期排队，是转写慢的主因（付费档位走独立队列）。
const ASR_MODEL = 'Qwen/Qwen3-ASR-1.7B';

// 上游超时兜底（毫秒）：仅防上游偶发挂起导致请求无限等待。
// 注意 Vercel 函数自身可能有更短的执行上限，届时平台会先于此处终止。
const ASR_TIMEOUT_MS = 25000;

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
    formData.append('model', ASR_MODEL);

    const response = await fetch('https://api.siliconflow.cn/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
      signal: AbortSignal.timeout(ASR_TIMEOUT_MS),
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
    if (error.name === 'TimeoutError') {
      console.error(`Transcribe Timeout: ${ASR_MODEL} 上游超过 ${ASR_TIMEOUT_MS}ms 未响应`);
      return res.status(504).json({ error: '语音识别服务超时，请重试' });
    }
    console.error('Transcribe Error:', error);
    return res.status(500).json({ error: '语音识别处理失败: ' + error.message });
  }
}

