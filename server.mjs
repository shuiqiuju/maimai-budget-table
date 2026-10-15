import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { demoCatalog } from './lib/demo.mjs';
import { planMeals, UserError, validateCatalog } from './lib/planner.mjs';
import { McpClient, extractArrays, mapCatalog } from './lib/mcp.mjs';
import { normalizeOfficialMenu, structuredResult } from './lib/official-menu.mjs';

const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'] };

export function createApp({ token = process.env.MCD_MCP_TOKEN, client = new McpClient({ token }) } = {}) {
  let liveCatalog = null, source = null, arrays = [], latestRead = null, revision = 0;
  let busy = false;
  let stores = [], preview = null;
  const lock = async fn => {
    if (busy) throw new UserError('另一个菜单请求正在进行，请稍候。', 409);
    busy = true; try { return await fn(); } finally { busy = false; }
  };
  const json = (res, status, data) => {
    let serialized = JSON.stringify(data);
    if (token) serialized = serialized.split(token).join('[REDACTED]');
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(serialized);
  };
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const localPort = req.socket.localPort;
      const allowedHosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
      if (!allowedHosts.includes(req.headers.host)) throw new UserError('仅允许本机访问。', 403);
      if (req.headers.origin && !allowedHosts.map(h => `http://${h}`).includes(req.headers.origin)) throw new UserError('不允许跨站请求。', 403);
      if (req.headers['sec-fetch-site'] === 'cross-site') throw new UserError('不允许跨站请求。', 403);
      const pathname = new URL(req.url, 'http://localhost').pathname;
      if (req.method === 'GET' && staticFiles[pathname]) {
        const [file, type] = staticFiles[pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
        res.end(await readFile(new URL(`./public/${file}`, import.meta.url))); return;
      }
      if (req.method === 'GET' && pathname === '/api/status') return json(res, 200, { tokenConfigured: Boolean(token), liveReady: Boolean(liveCatalog), source });
      if (req.method === 'GET' && pathname === '/api/catalog') return json(res, 200, { items: demoCatalog, mode: 'demo' });
      if (req.method !== 'POST') throw new UserError('未找到此页面。', 404);
      if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new UserError('请求必须是 JSON。', 415);
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 128 * 1024) throw new UserError('请求内容过大。', 413); chunks.push(chunk); }
      const raw = Buffer.concat(chunks).toString('utf8');
      let body;
      try { body = JSON.parse(raw); } catch { throw new UserError('JSON 格式不正确。'); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new UserError('请求需为 JSON 对象。');
      if (pathname === '/api/plan') {
        if (!['demo', 'live'].includes(body.mode)) throw new UserError('请选择有效的数据模式。');
        if (body.mode === 'live' && !liveCatalog) throw new UserError('请先连接并核对真实菜单。', 409);
        if (body.mode === 'live' && Date.now() - source.fetchedAt > 15 * 60 * 1000) throw new UserError('真实菜单已超过 15 分钟，请重新读取并核对。', 409);
        const result = planMeals(body.mode === 'live' ? liveCatalog : demoCatalog, body);
        return json(res, 200, { ...result, mode: body.mode, source: body.mode === 'live' ? source : { label: '演示菜单 · 示例价格', fetchedAt: null } });
      }
      if (pathname === '/api/live/stores') return await lock(async () => {
        if (![body.city, body.keyword].every(v => typeof v === 'string' && v.trim() && v.length <= 80)) throw new UserError('请填写城市和地标，每项最多 80 字。');
        const result = structuredResult(await client.call('query-nearby-stores', { searchType: 2, beType: 1, city: body.city.trim(), keyword: body.keyword.trim() }));
        if (!Array.isArray(result.data) || result.success === false) throw new UserError('未找到可用门店，请换个地标。', 502);
        stores = result.data.filter(s => typeof s.storeCode === 'string').map(s => ({ storeCode: s.storeCode, storeName: s.storeName, address: s.address, businessStatus: s.businessStatus, businessStartTime: s.businessStartTime, businessEndTime: s.businessEndTime }));
        return json(res, 200, { stores });
      });
      if (pathname === '/api/live/menu') return await lock(async () => {
        const store = stores.find(s => s.storeCode === body.storeCode);
        if (!store || store.businessStatus !== true) throw new UserError('请先搜索并选择当前营业的门店。');
        preview = null; revision++;
        const result = await client.call('query-meals', { storeCode: store.storeCode, orderType: 1, beType: 1 });
        const normalized = normalizeOfficialMenu(result);
        preview = { ...normalized, revision, source: { fetchedAt: Date.now(), label: '官方 MCP 菜单参考价', storeCode: store.storeCode, storeLabel: `${store.storeName} · 到店自取`, tool: 'query-meals', count: normalized.items.length, excludedCount: normalized.excludedCount } };
        return json(res, 200, preview);
      });
      if (pathname === '/api/live/activate') return await lock(async () => {
        if (!preview || body.revision !== preview.revision || Date.now() - preview.source.fetchedAt > 15 * 60 * 1000) throw new UserError('预览菜单已更新或过期，请重新读取。', 409);
        liveCatalog = preview.items; source = preview.source;
        return json(res, 200, { items: liveCatalog, source });
      });
      if (pathname === '/api/live/tools') return await lock(async () => json(res, 200, { tools: await client.tools() }));
      if (pathname === '/api/live/query') return await lock(async () => {
        if (!body.arguments || typeof body.arguments !== 'object' || Array.isArray(body.arguments)) throw new UserError('工具参数需为 JSON 对象。');
        if (body.name === 'query-meals') { arrays = []; latestRead = null; liveCatalog = null; source = null; revision++; }
        const result = await client.call(body.name, body.arguments);
        if (body.name === 'query-meals') {
          arrays = extractArrays(result);
          latestRead = { fetchedAt: Date.now(), label: '官方 MCP 菜单 · 人工核对单品价', tool: body.name };
        }
        return json(res, 200, { result, revision, arrays: body.name === 'query-meals' ? arrays : [] });
      });
      if (pathname === '/api/live/import') return await lock(async () => {
        if (!latestRead || body.revision !== revision) throw new UserError('菜单已更新，请重新读取后核对。', 409);
        if (Date.now() - latestRead.fetchedAt > 15 * 60 * 1000) throw new UserError('菜单已过期，请重新读取。', 409);
        const next = validateCatalog(mapCatalog(arrays[body.arrayIndex], body));
        if (!next.some(x => x.category === 'main')) throw new UserError('至少需要选一个主食。');
        if (typeof body.storeLabel !== 'string' || !body.storeLabel.trim() || body.storeLabel.length > 100) throw new UserError('请填写对应门店及就餐方式，最多 100 字。');
        liveCatalog = next;
        source = { ...latestRead, storeLabel: body.storeLabel.trim(), count: next.length };
        return json(res, 200, { items: liveCatalog, source });
      });
      throw new UserError('未找到此接口。', 404);
    } catch (error) { json(res, error instanceof UserError ? error.status : 500, { error: error instanceof UserError ? error.message : '服务暂时出错，请稍后重试。' }); }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be between 1024 and 65535');
  let token = process.env.MCD_MCP_TOKEN;
  if (!token && process.env.MCD_MCP_TOKEN_FILE) {
    try { token = (await readFile(process.env.MCD_MCP_TOKEN_FILE, 'utf8')).trim(); }
    catch { console.error('无法读取 MCD_MCP_TOKEN_FILE，请检查本机路径。'); process.exit(1); }
  }
  const server = createApp({ token });
  server.listen(port, '127.0.0.1', () => console.log(`麦麦预算配餐台 http://127.0.0.1:${port}`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '端口被占用，请在 .env 修改 PORT。' : '本地服务启动失败。'); process.exitCode = 1; });
}
