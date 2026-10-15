import test from 'node:test';
import assert from 'node:assert/strict';
import { McpClient, readRpc, mapCatalog, extractArrays } from '../lib/mcp.mjs';
test('MCP initialization, notification, session header, tool pagination and allowlist', async () => {
  const requests = [];
  const client = new McpClient({ token: 'test-only-token', fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body); requests.push({ url, options, body });
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
    const result = body.method === 'initialize' ? { protocolVersion: '2025-03-26' } : !body.params.cursor ? { tools: [{ name: 'query-meals' }, { name: 'create-order' }], nextCursor: 'next' } : { tools: [{ name: 'query-nearby-stores' }] };
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { headers: { 'Content-Type': 'application/json', 'Mcp-Session-Id': 'session1' } });
  } });
  assert.deepEqual((await client.tools()).map(t => t.name), ['query-meals', 'query-nearby-stores']);
  assert.equal(requests[2].options.headers['Mcp-Session-Id'], 'session1');
  assert.equal(requests[0].url, 'https://mcp.mcd.cn');
  assert.equal(requests[0].options.redirect, 'error');
  assert.equal('id' in requests[1].body, false);
  await assert.rejects(client.call('create-order', {}), /只允许/);
});
test('SSE parser survives fragmented CRLF and ignores notifications', async () => {
  const text = 'event: message\r\ndata: {"method":"notifications/progress"}\r\n\r\ndata: {"id":7,"result":{"ok":true}}\r\n\r\n';
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < text.length; i += 3) c.enqueue(new TextEncoder().encode(text.slice(i, i + 3))); c.close(); } });
  assert.deepEqual(await readRpc(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }), 7), { id: 7, result: { ok: true } });
});
test('HTTP failures do not echo secret content', async () => {
  const client = new McpClient({ token: 'private', fetchImpl: async () => new Response('private', { status: 401 }) });
  await assert.rejects(client.tools(), e => e.message.includes('Token') && !e.message.includes('private'));
});
test('field mapping preserves integer currency and rejects ambiguous price values', () => {
  const arrays = extractArrays({ structuredContent: { data: [{ name: '餐品', price: '12.34' }] } });
  const mapping = { nameField: 'name', priceField: 'price', unit: 'yuan', selections: [{ index: 0, category: 'main' }] };
  assert.equal(mapCatalog(arrays[0], mapping)[0].priceCents, 1234);
  assert.throws(() => mapCatalog(arrays[0], { ...mapping, unit: 'fen' }));
  assert.throws(() => mapCatalog({ rows: [{ name: '套餐', price: '12起' }] }, mapping));
  assert.throws(() => mapCatalog(arrays[0], { ...mapping, selections: [...mapping.selections, ...mapping.selections] }));
});
