import { MODEL_REGISTRY } from '../lib/model-registry.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const models = Object.entries(MODEL_REGISTRY).map(([id, m]) => ({
    id,
    label: m.label,
    provider: m.provider,
    vision: m.vision,
    keyConfigured: Boolean(process.env[m.keyEnv]),
  }));

  return res.status(200).json({ models });
}
