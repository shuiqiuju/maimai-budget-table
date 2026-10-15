const $ = id => document.getElementById(id);
const money = cents => (cents / 100).toFixed(2);
const escape = value => String(value).replace(/[&<>"']/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[x]));
let mode = 'demo', catalog = [], lastResult = null, liveCatalog = [], source = null, tools = [], arrays = [], revision = null, generation = 0;
let previewRevision = null;
const icons = { main: '🍔', side: '🍟', drink: '🥤' };

async function api(path, data) {
  const res = await fetch(path, data === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await res.json();
  if (!res.ok) throw new Error(result.error || '请求失败，请重试。');
  return result;
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').hidden = true, 3800); }
function displayMenu() { $('menu-count').textContent = `${catalog.length} 款`; $('menu-list').innerHTML = catalog.map(x => `<div class="menu-entry"><span>${icons[x.category]} ${escape(x.name)}</span><span>¥${money(x.priceCents)}</span></div>`).join(''); }
function updateSource() {
  $('demo-mode').classList.toggle('selected', mode === 'demo'); $('live-mode').classList.toggle('selected', mode === 'live');
  $('demo-mode').setAttribute('aria-pressed', String(mode === 'demo')); $('live-mode').setAttribute('aria-pressed', String(mode === 'live'));
  $('source-text').textContent = mode === 'demo' ? '演示菜单 · 全部为示例价格，不代表门店售价' : `${source?.storeLabel || ''} · 官方菜单单品价 · ${new Date(source?.fetchedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 读取`;
}
function invalidate() { generation++; lastResult = null; $('results').classList.add('stale'); $('results').querySelectorAll('button').forEach(b => b.disabled = true); $('result-status').textContent = '条件已修改，点击「帮我搭一餐」重新计算。'; }
function ticket(plan) {
  const r = lastResult;
  return [`麦麦预算配餐台 · ${plan.title}`, r.mode === 'demo' ? '【演示数据 / 非门店实价】' : `【官方菜单单品价】${r.source.storeLabel}`, `人数：${r.people} 人（每人相同搭配）`, `总预算：¥${money(r.budgetCents)}`, '----------------------------', ...plan.items.map(i => `${i.name} × ${i.quantity}  ¥${money(i.priceCents * i.quantity)}`), '----------------------------', `单品价合计：¥${money(plan.totalCents)}`, `人均：¥${money(plan.perPersonCents)}`, `预算余量：¥${money(plan.remainingCents)}`, `推荐理由：${plan.reason}`, r.source.fetchedAt ? `菜单读取：${new Date(r.source.fetchedAt).toLocaleString('zh-CN')}` : '价格为本地演示数据。', '不含优惠券、配送费及套餐优惠；非订单。', '独立参赛作品，非官方产品。价格与供应以官方渠道为准。'].join('\n');
}
function render(result) {
  $('results').classList.remove('stale'); $('result-status').classList.remove('error');
  $('result-status').textContent = result.plans.length ? `已比较 ${result.candidateCount} 种预算内搭配 · ${result.people} 人份 · ${result.plans.length} 个不同建议` : '预算内暂时没有合适搭配';
  $('results').innerHTML = result.plans.length ? result.plans.map((p, index) => `<article class="meal-card"><div class="card-top"><div class="card-caption"><span>MEAL / 0${index + 1}</span><span>${result.people} 人份</span></div><h3>${escape(p.title)}</h3><div class="food-visual" aria-hidden="true">${p.items.map(i => icons[i.category]).join(' ')}</div></div><div class="card-body"><div class="food-list">${p.items.map(i => `<div class="food-row"><span>${escape(i.name)}<small>¥${money(i.priceCents)} × ${i.quantity}</small></span><span>¥${money(i.priceCents * i.quantity)}</span></div>`).join('')}</div><div class="card-total"><div class="total-label">${result.mode === 'demo' ? '示例合计' : '单品价合计'} · 人均 ¥${money(p.perPersonCents)}</div><div class="total-price"><small>¥</small>${money(p.totalCents)}</div><div class="remaining">预算还剩 ¥${money(p.remainingCents)}</div></div><p class="reason">${escape(p.reason)}</p><div class="card-actions"><button data-copy="${index}">复制小票</button><button data-download="${index}">下载小票 ↓</button></div></div></article>`).join('') : `<div class="empty-state"><div class="empty-symbol">☕</div><h3>换个条件，再试一次。</h3><p>${escape(result.message)}</p></div>`;
}
async function generate(event) {
  event?.preventDefault();
  if (!$('planner-form').reportValidity()) return;
  const current = ++generation; lastResult = null;
  $('results').querySelectorAll('button').forEach(b => b.disabled = true);
  $('generate').disabled = true; $('result-status').textContent = '正在认真算这一餐…';
  try {
    const result = await api('/api/plan', { mode, budget: Number($('budget').value), people: Number($('people').value), preference: $('preference').value, requireDrink: $('drink').checked });
    if (current !== generation) return;
    lastResult = result; render(result);
  } catch (e) {
    if (current !== generation) return;
    $('results').innerHTML = ''; $('result-status').textContent = e.message; $('result-status').classList.add('error');
  } finally { $('generate').disabled = false; }
}
$('planner-form').addEventListener('submit', generate);
$('planner-form').addEventListener('input', invalidate);
$('budget').addEventListener('input', () => document.querySelectorAll('[data-budget]').forEach(b => b.classList.toggle('active', Number(b.dataset.budget) === Number($('budget').value))));
document.querySelectorAll('[data-budget]').forEach(button => button.addEventListener('click', () => { $('budget').value = button.dataset.budget; $('budget').dispatchEvent(new Event('input', { bubbles: true })); }));
for (const [id, delta] of [['people-minus', -1], ['people-plus', 1]]) $(id).addEventListener('click', () => { $('people').value = Math.max(1, Math.min(6, Number($('people').value || 1) + delta)); invalidate(); });
$('results').addEventListener('click', async event => {
  const button = event.target.closest('button'); if (!button || !lastResult) return;
  const index = Number(button.dataset.copy ?? button.dataset.download); const text = ticket(lastResult.plans[index]);
  if ('copy' in button.dataset) {
    try { await navigator.clipboard.writeText(text); toast('小票已复制，带着它去点餐吧。'); } catch { toast('当前浏览器不支持复制，请点击「下载小票」。'); }
  } else {
    const url = URL.createObjectURL(new Blob(['\uFEFF' + text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = `麦麦配餐-${lastResult.plans[index].title}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('小票已下载。');
  }
});
$('demo-mode').addEventListener('click', async () => { mode = 'demo'; catalog = (await api('/api/catalog')).items; updateSource(); displayMenu(); generate(); });
$('live-mode').addEventListener('click', () => { if (!liveCatalog.length) openConnect(); else { mode = 'live'; catalog = liveCatalog; updateSource(); displayMenu(); generate(); } });
async function openConnect() {
  $('connect-dialog').showModal();
  try {
    const status = await api('/api/status');
    $('connection-status').textContent = status.tokenConfigured ? '本机凭证已就绪。连接后读取官方工具和菜单。' : '尚未配置凭证：将 .env.example 复制为 .env，设置 MCD_MCP_TOKEN 或 MCD_MCP_TOKEN_FILE 后重启服务。';
  } catch (e) { $('connection-status').textContent = e.message; }
}
$('open-connect').addEventListener('click', openConnect); $('close-connect').addEventListener('click', () => $('connect-dialog').close());
async function task(button, fn) { button.disabled = true; try { await fn(); } catch (e) { $('connection-status').textContent = e.message; } finally { button.disabled = false; } }
$('search-stores').addEventListener('click', event => task(event.target, async () => {
  $('connection-status').textContent = '正在查询营业门店…'; $('store-results').innerHTML = ''; $('quick-preview').hidden = true;
  const data = await api('/api/live/stores', { city: $('city').value, keyword: $('landmark').value });
  $('store-results').innerHTML = data.stores.map(s => `<button class="store-option" data-store="${escape(s.storeCode)}" ${s.businessStatus !== true ? 'disabled' : ''}><strong>${escape(s.storeName)} ${s.businessStatus !== true ? '· 暂停营业' : '→'}</strong><small>${escape(s.address)} · ${escape(s.businessStartTime)}–${escape(s.businessEndTime)} · 编号 ${escape(s.storeCode)}</small></button>`).join('');
  $('connection-status').textContent = data.stores.length ? '选择一家营业门店，读取当前到店自取菜单。' : '这个地标没有找到门店，换一个关键词试试。';
}));
$('store-results').addEventListener('click', event => {
  const button = event.target.closest('[data-store]'); if (!button) return;
  task(button, async () => {
    $('connection-status').textContent = '正在读取并筛选固定规格单品…'; $('quick-preview').hidden = true;
    const data = await api('/api/live/menu', { storeCode: button.dataset.store }); previewRevision = data.revision;
    $('preview-title').textContent = data.source.storeLabel;
    $('preview-items').innerHTML = data.items.map(x => `<div class="menu-entry"><span>${icons[x.category]} ${escape(x.name)}</span><span>¥${money(x.priceCents)}</span></div>`).join('');
    $('preview-note').textContent = `已选取 ${data.items.length} 款明确规格单品，排除 ${data.excludedCount} 款套餐、会员附加价或待选规格商品。按菜单 currentPrice（元）计算参考合计，最终价格以官方下单页面为准。`;
    $('quick-preview').hidden = false; $('connection-status').textContent = '菜单读取成功。核对后即可使用，15 分钟后需刷新。';
    $('quick-preview').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
});
$('activate-menu').addEventListener('click', event => task(event.target, async () => {
  const data = await api('/api/live/activate', { revision: previewRevision });
  liveCatalog = data.items; source = data.source; catalog = liveCatalog; mode = 'live';
  updateSource(); displayMenu(); $('connect-dialog').close(); generate(); toast('已接入当前门店，开始用真实菜单配餐。');
}));
function showSchema() { const tool = tools.find(t => t.name === $('tool-name').value); $('tool-schema').textContent = tool ? JSON.stringify(tool, null, 2) : '请先读取官方工具参数。'; }
$('load-tools').addEventListener('click', event => task(event.target, async () => { $('connection-status').textContent = '正在连接官方 MCP…'; tools = (await api('/api/live/tools', {})).tools; showSchema(); $('connection-status').textContent = `已连接，发现 ${tools.length} 个可用只读工具。`; }));
$('tool-name').addEventListener('change', showSchema);
$('query-tool').addEventListener('click', event => task(event.target, async () => {
  let args; try { args = JSON.parse($('tool-args').value); } catch { throw new Error('参数不是有效 JSON，请检查引号和逗号。'); }
  $('connection-status').textContent = '正在读取官方数据…';
  if ($('tool-name').value === 'query-meals') { liveCatalog = []; $('mapping').hidden = true; if (mode === 'live') { invalidate(); $('results').innerHTML = ''; } }
  const data = await api('/api/live/query', { name: $('tool-name').value, arguments: args });
  $('raw-result').textContent = JSON.stringify(data.result, null, 2);
  arrays = data.arrays; revision = data.revision;
  $('connection-status').textContent = arrays.length ? '已读取菜单。请核对单品、价格单位和分类后导入。' : '已读取官方结果。请展开返回内容；若是门店查询，可据此填写菜单参数。';
  $('mapping').hidden = !arrays.length;
  if (arrays.length) { $('array-path').innerHTML = arrays.map((a, i) => `<option value="${i}">${escape(a.path)}（${a.rows.length} 行）</option>`).join(''); populateFields(); }
}));
function populateFields() {
  const rows = arrays[Number($('array-path').value)]?.rows || [];
  const fields = [...new Set(rows.slice(0, 120).flatMap(row => row && typeof row === 'object' ? Object.keys(row) : []))];
  for (const id of ['name-field', 'price-field']) $(id).innerHTML = '<option value="">请选择字段</option>' + fields.map(f => `<option value="${escape(f)}">${escape(f)}</option>`).join('');
  $('mapping-rows').innerHTML = ''; $('price-unit').value = '';
}
function mappingRows() {
  const rows = arrays[Number($('array-path').value)]?.rows || [];
  const name = $('name-field').value, price = $('price-field').value;
  if (!name || !price) return;
  $('mapping-rows').innerHTML = rows.slice(0, 120).map((r, i) => `<div class="mapping-row"><input type="checkbox" data-index="${i}" aria-label="选择 ${escape(r?.[name] ?? '未命名')}"><div>${escape(r?.[name] ?? '缺少名称')}<small>原始价格：${escape(r?.[price] ?? '缺少价格')}</small></div><select aria-label="第 ${i + 1} 项分类" data-category="${i}"><option value="">分类</option><option value="main">主食</option><option value="side">小食</option><option value="drink">饮品</option></select><select aria-label="第 ${i + 1} 项口味" data-flavor="${i}"><option value="unknown">口味未知</option><option value="chicken">鸡肉</option><option value="beef">牛肉</option><option value="fish">鱼肉</option><option value="other">其他</option></select></div>`).join('');
}
$('array-path').addEventListener('change', populateFields); $('name-field').addEventListener('change', mappingRows); $('price-field').addEventListener('change', mappingRows);
$('import-menu').addEventListener('click', event => task(event.target, async () => {
  const selections = [...document.querySelectorAll('[data-index]:checked')].map(el => ({ index: Number(el.dataset.index), category: document.querySelector(`[data-category="${el.dataset.index}"]`).value, flavor: document.querySelector(`[data-flavor="${el.dataset.index}"]`).value }));
  const data = await api('/api/live/import', { arrayIndex: Number($('array-path').value), revision, nameField: $('name-field').value, priceField: $('price-field').value, unit: $('price-unit').value, storeLabel: $('store-label').value, selections });
  liveCatalog = data.items; source = data.source; mode = 'live'; catalog = liveCatalog;
  updateSource(); displayMenu(); $('connect-dialog').close(); generate(); toast('已切换真实菜单，单品价已核对。');
}));
try { catalog = (await api('/api/catalog')).items; displayMenu(); await generate(); } catch (e) { $('result-status').textContent = e.message; }
