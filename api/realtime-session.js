export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: '服务端未配置 DASHSCOPE_API_KEY 环境变量，请在 Vercel 环境变量中添加。'
    });
  }

  try {
    const adminPassword = process.env.ADMIN_PASSWORD || 'finance2026';
    const authHeader = req.headers['x-admin-password'] || '';
    
    let offerSdp = '';
    let password = authHeader;
    let model = 'qwen3.5-omni-flash-realtime';

    // Handle JSON or raw SDP body
    if (typeof req.body === 'object' && req.body !== null) {
      offerSdp = req.body.sdp || '';
      password = req.body.password || password;
      model = req.body.model || model;
    } else if (typeof req.body === 'string') {
      offerSdp = req.body;
    }

    // Password validation
    if (!password || password.trim() !== adminPassword.trim()) {
      return res.status(401).json({
        error: 'AUTH_REQUIRED',
        message: '未提供管理员密码或密码错误，无权建立 Realtime 会话'
      });
    }

    if (!offerSdp || !offerSdp.trim()) {
      return res.status(400).json({ error: '缺少 WebRTC Offer SDP' });
    }

    // Use standard default DashScope WebRTC endpoint
    const dashscopeUrl = `https://dashscope.aliyuncs.com/api/v1/webrtc/realtime?model=${encodeURIComponent(model)}`;
    console.log(`Connecting to DashScope WebRTC default endpoint: ${dashscopeUrl}`);

    const dsResponse = await fetch(dashscopeUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/sdp',
      },
      body: offerSdp.trim(),
    });

    const resText = await dsResponse.text();

    if (!dsResponse.ok) {
      console.error('DashScope WebRTC Error:', dsResponse.status, resText);
      return res.status(dsResponse.status).json({
        error: `阿里云百炼 WebRTC 连接失败 (${dsResponse.status}): ${resText.slice(0, 200)}`
      });
    }

    // Answer SDP returned from DashScope
    return res.status(200).json({
      success: true,
      sdp: resText
    });
  } catch (error) {
    console.error('Realtime Session Error:', error);
    return res.status(500).json({
      error: 'Realtime 会话建立失败: ' + error.message
    });
  }
}
