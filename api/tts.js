const { EdgeTTS } = require('node-edge-tts');
const fs = require('fs');
const path = require('path');
const os = require('os');

export default async function handler(req, res) {
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
    const cleanText = text.trim()
      .replace(/\*\*/g, '')
      .replace(/#/g, '')
      .replace(/`/g, '')
      .slice(0, 1000); 

    const tts = new EdgeTTS({
      voice: voice,
      lang: 'zh-CN',
      pitch: '+0Hz',
      rate: '+5%',
      volume: '+0%'
    });

    const tmpPath = path.join(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).substring(7)}.mp3`);
    
    await tts.ttsPromise(cleanText, tmpPath);

    const audioBuffer = fs.readFileSync(tmpPath);
    
    // Clean up temp file
    try {
      fs.unlinkSync(tmpPath);
    } catch (e) {
      console.warn('Failed to delete temp file:', e);
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(audioBuffer);
  } catch (error) {
    console.error('Edge-TTS Synthesis Error:', error);
    return res.status(500).json({ error: 'Edge-TTS 语音合成失败: ' + error.message });
  }
}
