import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { probeOllama } from './ollama-probe.ts';

const settings = { baseUrl: 'http://100.119.28.121:11434', model: 'gemma2:9b', cpuOnly: true };
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
test('probe uses selected model and CPU option and verifies structured generation', async () => {
  const result = await probeOllama(settings, async (url, init) => {
    assert.equal(url, `${settings.baseUrl}/api/generate`);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, settings.model);
    assert.equal(body.options.num_gpu, 0);
    assert.equal(body.options.num_ctx, 4096);
    assert.equal(init?.redirect, 'error');
    assert.equal(body.stream, false);
    return reply({ done: true, response: '{"ok":true}', eval_count: 6, eval_duration: 2e9 });
  });
  assert.equal(result.ok, true);assert.equal(result.tokensPerSecond, 3);
});
test('automatic hardware mode does not force CPU', async () => {
  await probeOllama({ ...settings, cpuOnly: false }, async (_, init) => {
    assert.equal('num_gpu' in JSON.parse(String(init?.body)).options, false);
    return reply({ done: true, response: '{"ok":true}' });
  });
});
test('runner failures include bounded server error', async () => {
  const result = await probeOllama(settings, async () => reply({ error: 'runner terminated' }, 500));
  assert.equal(result.ok, false);assert.match(result.error!, /HTTP 500.*runner terminated/);
});
test('HTTP success with invalid JSON is not a passing inference', async () => {
  const result = await probeOllama(settings, async () => reply({ done: true, response: 'not json' }));
  assert.equal(result.ok, false);assert.equal(result.stage, 'response');
});
test('wrong answer and unfinished generations cannot pass', async () => {
  for (const value of [{ done: true, response: '{"ok":false}' }, { done: false, response: '{"ok":true}' }]) {
    assert.equal((await probeOllama(settings, async () => reply(value))).ok, false);
  }
});
test('thinking-only output is reported without claiming success', async () => {
  const result = await probeOllama(settings, async () => reply({ done: true, response: '', thinking: 'reasoning' }));
  assert.equal(result.ok, false);assert.match(result.error!, /未回傳答案/);
});
test('timeout is distinguished from network errors', async () => {
  const result = await probeOllama(settings, async () => { await delay(15);throw new Error('aborted'); }, 1);
  assert.equal(result.ok, false);assert.match(result.error!, /已中止/);
});
test('network error has a useful connection message', async () => {
  const result = await probeOllama(settings, async () => { throw new TypeError('fetch failed'); });
  assert.equal(result.ok, false);assert.match(result.error!, /Tailscale/);
});
test('non-JSON HTTP response is a format failure', async () => {
  const result = await probeOllama(settings, async () => new Response('<html>unavailable</html>'));
  assert.equal(result.ok, false);assert.equal(result.stage, 'response');assert.match(result.error!, /格式無效/);
});
