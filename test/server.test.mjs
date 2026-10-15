import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server.mjs';
test('HTTP demo works, live never silently falls back, cross-site calls blocked', async t => {
  const server = createApp({ token: '' }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, body, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await fetch(base)).status, 200);
  const result = await (await post('/api/plan', { mode: 'demo', budget: 35, people: 1 })).json();
  assert.equal(result.plans.length, 3); assert.equal(result.mode, 'demo');
  assert.equal((await post('/api/plan', { mode: 'live', budget: 35, people: 1 })).status, 409);
  assert.equal((await post('/api/plan', { mode: 'demo', budget: 35, people: 1 }, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await fetch(base + '/.env')).status, 404);
  assert.equal((await post('/api/live/tools', {})).status, 503);
});

test('real-mode HTTP chain uses upstream prices and rejects wrong menu revision', async t => {
  const calls = [];
  const client = { async call(name, args) {
    calls.push({ name, args });
    if (name === 'query-nearby-stores') return { structuredContent: { success: true, data: [{ storeCode: 'test-store', storeName: '测试门店', businessStatus: true }] } };
    return { structuredContent: { success: true, data: { categories: [{ name: '鸡肉汉堡', meals: [{ code: 'a', tags: ['单品'] }] }, { name: '饮品', meals: [{ code: 'b' }] }], meals: { a: { name: '麦香鸡', currentPrice: '17' }, b: { name: '纯悦', currentPrice: '7.5' } } } } };
  } };
  const server = createApp({ token: 'test-token', client }); await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => server.close(r)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  assert.equal((await post('/api/live/menu', { storeCode: 'guessed' })).status, 400);
  await post('/api/live/stores', { city: '上海', keyword: '人民广场' });
  const preview = await (await post('/api/live/menu', { storeCode: 'test-store' })).json();
  assert.equal((await post('/api/live/activate', { revision: -1 })).status, 409);
  assert.equal((await post('/api/live/activate', { revision: preview.revision })).status, 200);
  const result = await (await post('/api/plan', { mode: 'live', budget: 30, people: 1 })).json();
  assert.equal(result.plans[0].totalCents, 2450); assert.equal(result.mode, 'live');
  assert.equal(result.source.storeCode, 'test-store');
  assert.deepEqual(calls.map(c => c.name), ['query-nearby-stores', 'query-meals']);
  assert.deepEqual(calls[1].args, { storeCode: 'test-store', orderType: 1, beType: 1 });
});
