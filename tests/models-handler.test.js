import { test } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/models.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

test('GET /api/models 返回三个模型及 keyConfigured 状态', async () => {
  process.env.DASHSCOPE_API_KEY = 'test-dash';
  delete process.env.DEEPSEEK_API_KEY;
  process.env.ZHIPU_API_KEY = 'test-glm';

  const res = mockRes();
  await handler({ method: 'GET' }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.models.map(m => m.id), ['qwen-flash', 'deepseek-flash', 'glm-flash']);
  const byId = Object.fromEntries(res.body.models.map(m => [m.id, m]));
  assert.equal(byId['qwen-flash'].keyConfigured, true);
  assert.equal(byId['deepseek-flash'].keyConfigured, false);
  assert.equal(byId['glm-flash'].vision, true);
  assert.equal(byId['glm-flash'].label, 'glm-5.3-flash');
});

test('非 GET 请求返回 405', async () => {
  const res = mockRes();
  await handler({ method: 'POST' }, res);
  assert.equal(res.statusCode, 405);
});
