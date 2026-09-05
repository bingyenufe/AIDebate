export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { password } = req.body || {};
    const adminPassword = process.env.ADMIN_PASSWORD || 'finance2026';

    if (!password || password.trim() !== adminPassword.trim()) {
      return res.status(401).json({
        success: false,
        error: '密码不正确，请重新输入！'
      });
    }

    // Return success
    return res.status(200).json({
      success: true,
      message: '密码验证通过'
    });
  } catch (error) {
    console.error('Password verify error:', error);
    return res.status(500).json({ error: '服务端验证异常: ' + error.message });
  }
}
