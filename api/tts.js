const MsTTS = require('ms-tts');

export default async function handler(req, res) {
  // Allow GET and POST methods
  let text = '';
  let voice = 'zh-CN-YunxiNeural';

  if (req.method === 'GET') {
    text = req.query.text || '';
    voice = req.query.voice || voice;
  } else if (req.method === 'POST') {
    text = req.body.text || '';
    voice = req.body.voice || voice;
  } else {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!text || !text.trim()) {
    return res.status(400).json({ error: '缺少朗读文本参数 (text)' });
  }

  try {
    const tts = new MsTTS();
    await tts.init();

    // Clean text (remove markdown asterisks or special format characters)
    const cleanText = text.trim()
      .replace(/\*\*/g, '')
      .replace(/#/g, '')
      .replace(/`/g, '')
      .slice(0, 1000); // capped for safety

    const readable = await tts.toStream(cleanText, {
      voice: voice,
      rate: '5%',
      pitch: '0Hz',
    });

    const chunks = [];
    for await (const chunk of readable) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('Edge-TTS Synthesis Error:', error);
    return res.status(500).json({ error: 'Edge-TTS 语音合成失败: ' + error.message });
  }
}
