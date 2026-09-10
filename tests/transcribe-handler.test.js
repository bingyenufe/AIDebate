import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/transcribe.js';

function mockRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

function mockReq(audio = 'fake-audio-bytes', contentType = 'audio/webm') {
  return {
    method: 'POST',
    headers: { 'content-type': contentType },
    async *[Symbol.asyncIterator]() {
      if (audio) yield Buffer.from(audio);
    },
  };
}

function okFetch(text = '今天天气不错') {
  return async (url, opts) => {
    globalThis.__capturedAsr = { url, formData: opts.body, signal: opts.signal };
    return { ok: true, status: 200, text: async () => JSON.stringify({ text }) };
  };
}

beforeEach(() => {
  process.env.SILICONFLOW_API_KEY = 'sf-key';
  globalThis.__capturedAsr = null;
});

test('转写走付费模型 Qwen3-ASR-1.7B 与 SiliconFlow 转写端点', async () => {
  global.fetch = okFetch();
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.text, '今天天气不错');
  assert.equal(globalThis.__capturedAsr.url, 'https://api.siliconflow.cn/v1/audio/transcriptions');
  assert.equal(globalThis.__capturedAsr.formData.get('model'), 'Qwen/Qwen3-ASR-1.7B');
  assert.ok(globalThis.__capturedAsr.formData.get('file'), '必须带上音频文件');
});

test('上游请求带超时信号（防偶发挂起无限等待）', async () => {
  global.fetch = okFetch();
  await handler(mockReq(), mockRes());
  assert.ok(globalThis.__capturedAsr.signal instanceof AbortSignal, 'fetch 必须带 AbortSignal');
});

test('上游超时返回 504 且文案含「超时」', async () => {
  global.fetch = async () => {
    throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  };
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 504);
  assert.match(res.body.error, /超时/);
});

test('未配置 SILICONFLOW_API_KEY 返回 500 并提示环境变量名', async () => {
  delete process.env.SILICONFLOW_API_KEY;
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 500);
  assert.match(res.body.error, /SILICONFLOW_API_KEY/);
});

test('空音频返回 400，不调用上游', async () => {
  global.fetch = async () => { throw new Error('不该调用上游'); };
  const res = mockRes();
  await handler(mockReq(''), res);
  assert.equal(res.statusCode, 400);
});

test('上游报错时透传状态码与错误信息', async () => {
  global.fetch = async () => ({
    ok: false,
    status: 400,
    text: async () => JSON.stringify({ message: 'Invalid audio format' }),
  });
  const res = mockRes();
  await handler(mockReq(), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Invalid audio format/);
});
