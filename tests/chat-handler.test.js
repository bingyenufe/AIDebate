import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/chat.js';
import { MODEL_REGISTRY } from '../lib/model-registry.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

function okFetch(content = 'AI 回复') {
  return async (url, opts) => {
    globalThis.__capturedFetch = { url, body: JSON.parse(opts.body), headers: opts.headers };
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
    };
  };
}

function baseBody(overrides = {}) {
  return {
    messages: [{ role: 'user', content: '你好' }],
    roleType: 'socrates',
    modelId: 'qwen-flash',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.DASHSCOPE_API_KEY = 'dash-key';
  process.env.DEEPSEEK_API_KEY = 'ds-key';
  process.env.ZHIPU_API_KEY = 'glm-key';
  globalThis.__capturedFetch = null;
});

test('modelId 缺失返回 400', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: undefined }) }, res);
  assert.equal(res.statusCode, 400);
});

test('未知 modelId 返回 400', async () => {
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: 'gpt-9' }) }, res);
  assert.equal(res.statusCode, 400);
});

test('平台 Key 未配置返回 400 并提示环境变量名', async () => {
  delete process.env.DEEPSEEK_API_KEY;
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: 'deepseek-flash' }) }, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /DEEPSEEK_API_KEY/);
});

test('按 modelId 路由到正确平台与模型名', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ modelId: 'glm-flash' }) }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(globalThis.__capturedFetch.url, 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
  assert.equal(globalThis.__capturedFetch.body.model, 'glm-5.3-flash');
  assert.equal(globalThis.__capturedFetch.headers.Authorization, 'Bearer glm-key');
  assert.equal(res.body.reply, 'AI 回复');
});

test('带图消息：最后一条 user 消息转为视觉格式', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({
    method: 'POST',
    body: baseBody({
      messages: [
        { role: 'user', content: '第一轮' },
        { role: 'assistant', content: '第一轮回复' },
        { role: 'user', content: '这道题怎么算？' },
      ],
      imageDataUrl: 'data:image/jpeg;base64,AAAA',
    }),
  }, res);
  const msgs = globalThis.__capturedFetch.body.messages;
  const last = msgs[msgs.length - 1];
  assert.equal(last.role, 'user');
  assert.equal(last.content[0].type, 'image_url');
  assert.equal(last.content[0].image_url.url, 'data:image/jpeg;base64,AAAA');
  assert.equal(last.content[1].type, 'text');
  assert.equal(last.content[1].text, '这道题怎么算？');
  // 历史消息不受影响（msgs[0] 为 system 提示词，msgs[1] 才是首条历史消息）
  assert.equal(msgs[1].content, '第一轮');
});

test('vision=false 的模型收到图片返回 400（守卫）', async () => {
  const orig = MODEL_REGISTRY['qwen-flash'].vision;
  MODEL_REGISTRY['qwen-flash'].vision = false;
  try {
    const res = mockRes();
    await handler({ method: 'POST', body: baseBody({ imageDataUrl: 'data:image/jpeg;base64,AAAA' }) }, res);
    assert.equal(res.statusCode, 400);
    assert.match(res.body.error, /不支持图片/);
  } finally {
    MODEL_REGISTRY['qwen-flash'].vision = orig;
  }
});

test('first_grade 教辅角色：提示词含 45 字限制，预算取思考兜底下限 1024', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ roleType: 'first_grade' }) }, res);
  const sys = globalThis.__capturedFetch.body.messages[0].content;
  assert.match(sys, /一年级/);
  assert.match(sys, /45 字以内/);
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 1024);
});

test('whys 教辅角色：提示词含 30 字限制，预算取思考兜底下限 1024', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ roleType: 'whys' }) }, res);
  const sys = globalThis.__capturedFetch.body.messages[0].content;
  assert.match(sys, /十万个为什么/);
  assert.match(sys, /30 字以内/);
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 1024);
});

test('对辩角色不回归：socrates 走新模型且提示词保持 80 字', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler({ method: 'POST', body: baseBody({ roleType: 'socrates', modelId: 'deepseek-flash' }) }, res);
  const sys = globalThis.__capturedFetch.body.messages[0].content;
  assert.match(sys, /苏格拉底/);
  assert.match(sys, /80 字以内/);
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 1024); // deepseek 思考兜底下限
  assert.equal(globalThis.__capturedFetch.body.model, 'deepseek-flash');
});

test('思考模式控制：qwen 关思考、deepseek 关思考、glm 降为 low 档', async () => {
  global.fetch = okFetch();

  await handler({ method: 'POST', body: baseBody({ modelId: 'qwen-flash' }) }, mockRes());
  assert.equal(globalThis.__capturedFetch.body.enable_thinking, false);

  await handler({ method: 'POST', body: baseBody({ modelId: 'deepseek-flash' }) }, mockRes());
  assert.deepEqual(globalThis.__capturedFetch.body.thinking, { type: 'disabled' });

  await handler({ method: 'POST', body: baseBody({ modelId: 'glm-flash' }) }, mockRes());
  assert.equal(globalThis.__capturedFetch.body.reasoning_effort, 'low');
});

test('思考型模型输出预算下限：qwen/deepseek 兜底 1024、glm 兜底 2048', async () => {
  global.fetch = okFetch();

  await handler({ method: 'POST', body: baseBody({ modelId: 'qwen-flash', roleType: 'first_grade' }) }, mockRes());
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 1024);

  await handler({ method: 'POST', body: baseBody({ modelId: 'glm-flash', roleType: 'first_grade' }) }, mockRes());
  assert.equal(globalThis.__capturedFetch.body.max_tokens, 2048);
});

test('上游只返回思考内容（content 为空）时返回 502，不得静默 200', async () => {
  global.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: '', reasoning_content: '思考过程…' }, finish_reason: 'length' }],
    }),
  });

  const res = mockRes();
  await handler({ method: 'POST', body: baseBody() }, res);
  assert.equal(res.statusCode, 502);
  assert.match(res.body.error, /finish_reason=length/);
});
