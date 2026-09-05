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

    let clientWorkspaceId = '';
    let region = process.env.DASHSCOPE_REGION || 'cn-beijing';

    // Handle JSON or raw SDP body
    if (typeof req.body === 'object' && req.body !== null) {
      offerSdp = req.body.sdp || '';
      password = req.body.password || password;
      model = req.body.model || model;
      clientWorkspaceId = req.body.workspaceId || '';
      if (req.body.region) region = req.body.region;
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

    // Determine Workspace ID (Env Var > Header > Body)
    const headerWorkspaceId = req.headers['x-workspace-id'] || '';
    const workspaceId = (process.env.DASHSCOPE_WORKSPACE_ID || headerWorkspaceId || clientWorkspaceId || '').trim();

    if (!workspaceId) {
      return res.status(400).json({
        error: 'WORKSPACE_ID_REQUIRED',
        message: '阿里云百炼 WebRTC 实时通信需要配置业务空间 ID (Workspace ID)。请在阿里云百炼控制台（右上角业务空间管理）复制您的业务空间 ID（格式形如 llm-xxxxxx 或 ws-xxxxxx），并在 Vercel 环境变量中添加 DASHSCOPE_WORKSPACE_ID，或在网页端「业务空间」直接填入。'
      });
    }

    // Use DashScope Workspace-dedicated MaaS WebRTC endpoint
    const dashscopeUrl = process.env.DASHSCOPE_WEBRTC_URL || 
      `https://${workspaceId}.${region}.maas.aliyuncs.com/api/v1/webrtc/realtime?model=${encodeURIComponent(model)}`;
    console.log(`Connecting to DashScope WebRTC endpoint: ${dashscopeUrl}`);

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
        error: `阿里云百炼 WebRTC 连接失败 (${dsResponse.status}): ${resText.slice(0, 300)}`
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
