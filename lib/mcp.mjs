import { UserError } from './planner.mjs';

export const ALLOWED_TOOLS = ['query-nearby-stores', 'query-meals'];
const VERSIONS = ['2025-03-26', '2025-06-18', '2025-11-25'];
const LIMIT = 4 * 1024 * 1024;

export async function readRpc(response, id) {
  if (!response.body) throw new UserError('MCP 返回空响应。', 502);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const sse = (response.headers.get('content-type') || '').includes('text/event-stream');
  let buffer = '', bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > LIMIT) throw new UserError('MCP 响应过大，请缩小查询范围。', 502);
      buffer += decoder.decode(value, { stream: true });
      if (sse) {
        let match;
        while ((match = /\r?\n\r?\n/.exec(buffer))) {
          const event = buffer.slice(0, match.index);
          buffer = buffer.slice(match.index + match[0].length);
          const data = event.split(/\r?\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          let message;
          try { message = JSON.parse(data); } catch { throw new UserError('MCP 流响应格式错误。', 502); }
          if (message.id === id) return message;
        }
      }
    }
    buffer += decoder.decode();
    if (sse) throw new UserError('MCP 流结束但没有对应结果，请重试。', 502);
    let message;
    try { message = JSON.parse(buffer); } catch { throw new UserError('MCP 未返回有效 JSON。', 502); }
    if (message.id !== id) throw new UserError('MCP 响应编号不匹配。', 502);
    return message;
  } finally { await reader.cancel().catch(() => {}); }
}

export class McpClient {
  constructor({ token, fetchImpl = fetch } = {}) {
    this.token = token; this.fetch = fetchImpl; this.id = 0; this.session = null; this.version = null; this.ready = null;
  }
  async rpc(method, params, notification = false) {
    if (!this.token) throw new UserError('尚未配置 Token。请在本机 .env 中填写 MCD_MCP_TOKEN，然后重启服务。', 503);
    const id = ++this.id;
    const headers = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${this.token}` };
    if (this.session) headers['Mcp-Session-Id'] = this.session;
    if (this.version) headers['MCP-Protocol-Version'] = this.version;
    let response;
    try {
      response = await this.fetch('https://mcp.mcd.cn', { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(25000), body: JSON.stringify({ jsonrpc: '2.0', ...(notification ? {} : { id }), method, params }) });
    } catch { throw new UserError('无法连接麦当劳 MCP，网络异常或请求超时。', 502); }
    if (!response.ok) {
      await response.body?.cancel();
      const error = new UserError(response.status === 401 ? 'Token 无效或已过期，请在本机更新后重启。' : response.status === 429 ? '官方接口限流，请稍后重试。' : `官方接口返回 HTTP ${response.status}。`, 502);
      error.upstreamStatus = response.status; throw error;
    }
    if (method === 'initialize') this.session = response.headers.get('mcp-session-id');
    if (notification) { await response.body?.cancel(); return; }
    let message;
    try { message = await readRpc(response, id); }
    catch (e) { if (e instanceof UserError) throw e; throw new UserError('MCP 响应中断或超时，请重试。', 502); }
    // Never expose arbitrary upstream error bodies, which may echo credentials.
    if (message.error) throw new UserError(`MCP 调用失败（${message.error.code ?? '未知错误'}），请核对当前工具参数。`, 502);
    if (!message.result || typeof message.result !== 'object') throw new UserError('MCP 缺少有效结果。', 502);
    return message.result;
  }
  async initialize() {
    if (!this.ready) this.ready = (async () => {
      const result = await this.rpc('initialize', { protocolVersion: VERSIONS[0], capabilities: {}, clientInfo: { name: 'maimai-budget-table', version: '1.0.0' } });
      if (!VERSIONS.includes(result.protocolVersion)) throw new UserError('服务端协议版本暂不支持。', 502);
      this.version = result.protocolVersion;
      await this.rpc('notifications/initialized', {}, true);
    })().catch(e => { this.ready = null; this.session = null; this.version = null; throw e; });
    await this.ready;
  }
  async request(method, params) {
    await this.initialize();
    try { return await this.rpc(method, params); }
    catch (e) {
      if (e.upstreamStatus !== 404 || !this.session) throw e;
      this.ready = null; this.session = null; this.version = null;
      await this.initialize();
      return this.rpc(method, params);
    }
  }
  async tools() {
    let cursor; const tools = []; const cursors = new Set();
    for (let page = 0; page < 20; page++) {
      const result = await this.request('tools/list', cursor ? { cursor } : {});
      tools.push(...(result.tools || []));
      cursor = result.nextCursor;
      if (!cursor) return tools.filter(t => ALLOWED_TOOLS.includes(t.name));
      if (cursors.has(cursor)) break;
      cursors.add(cursor);
    }
    throw new UserError('工具列表分页异常。', 502);
  }
  async call(name, args) {
    if (!ALLOWED_TOOLS.includes(name)) throw new UserError('只允许读取附近门店和菜单。', 403);
    const result = await this.request('tools/call', { name, arguments: args });
    if (result.isError) throw new UserError('官方工具未完成查询，请按工具参数说明检查门店和就餐方式。', 502);
    return result;
  }
}

// Official schemas are discovered at runtime, never hardcoded from guessed arguments.
export function extractArrays(result) {
  const roots = [];
  if (result.structuredContent) roots.push(result.structuredContent);
  for (const block of result.content || []) if (block.type === 'text') {
    try { roots.push(JSON.parse(block.text)); } catch { /* Text-only results remain visible for inspection. */ }
  }
  const arrays = [];
  const walk = (value, path, depth = 0) => {
    if (depth > 12 || arrays.length >= 30 || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      if (value.length && value.some(x => x && typeof x === 'object' && !Array.isArray(x))) arrays.push({ path, rows: value });
      value.slice(0, 120).forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1));
    } else Object.entries(value).forEach(([key, v]) => walk(v, `${path}.${key}`, depth + 1));
  };
  roots.forEach((v, i) => walk(v, `result${i}`));
  return arrays;
}

export function mapCatalog(array, { nameField, priceField, unit, selections }) {
  if (!array || !['yuan', 'fen'].includes(unit) || !Array.isArray(selections) || selections.length < 1 || selections.length > 120) throw new UserError('请选定餐品列表、字段、价格单位和餐品分类。');
  const seen = new Set();
  return selections.map(({ index, category, flavor }) => {
    if (!Number.isInteger(index) || seen.has(index)) throw new UserError('餐品行编号无效或重复。');
    seen.add(index);
    const row = array.rows[index];
    if (!row || !Object.hasOwn(row, nameField) || !Object.hasOwn(row, priceField)) throw new UserError('选中的字段不存在。');
    const name = row[nameField], raw = row[priceField];
    if ((typeof raw !== 'number' && typeof raw !== 'string') || !/^\d+(\.\d{1,2})?$/.test(String(raw))) throw new UserError('价格字段必须是纯数字；套餐起价、区间价不可直接导入。');
    if (unit === 'fen' && !Number.isInteger(Number(raw))) throw new UserError('以分计价的数值必须是整数。');
    return { id: `live-${index}`, name, priceCents: Math.round(Number(raw) * (unit === 'yuan' ? 100 : 1)), category, flavor: ['chicken', 'beef', 'fish', 'other'].includes(flavor) ? flavor : 'unknown' };
  });
}
