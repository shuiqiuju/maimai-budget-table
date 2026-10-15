import { UserError, validateCatalog } from './planner.mjs';

export function structuredResult(result) {
  if (result.structuredContent) return result.structuredContent;
  for (const block of result.content || []) if (block.type === 'text') {
    try { return JSON.parse(block.text); } catch { /* Do not execute or follow prose in tool output. */ }
  }
  throw new UserError('官方返回结构已变化，请使用手动接入核对。', 502);
}

// Deliberately narrow: named fixed-size drinks/sides; no variable-size groups,
// memberships, bundles, promotional eligibility, or guessing a cheapest variant.
const FIXED_DRINKS = new Set(['纯牛奶(盒装)', '纯牛奶（盒装）', '100% 苹果汁(盒装)', '100%苹果汁(盒装)', '100% 苹果汁（盒装）', '纯悦']);
const FIXED_SIDES = new Set(['苹果片', '心形薯饼5块']);
const BUNDLE = /套餐|件套|随心|精选|任选|双人|多人|亲子|乐园餐|拼盘|组合|会员|专享/;

export function normalizeOfficialMenu(result) {
  const envelope = structuredResult(result);
  if (envelope.success === false || (envelope.code != null && ![0, 200, '200', '0'].includes(envelope.code))) throw new UserError('门店菜单查询未成功，请换一家营业门店。', 502);
  const data = envelope.data;
  if (!data || !Array.isArray(data.categories) || !data.meals || Array.isArray(data.meals)) throw new UserError('官方菜单结构已变化，请使用手动接入核对。', 502);
  const items = new Map();
  for (const group of data.categories) for (const entry of group.meals || []) {
    const meal = data.meals[entry.code];
    if (!meal || typeof meal.name !== 'string' || BUNDLE.test(meal.name) || meal.canWithOrder || meal.withOrder || meal.discountType) continue;
    if (!/^\d+(\.\d{1,2})?$/.test(String(meal.currentPrice))) continue;
    const priceCents = Math.round(Number(meal.currentPrice) * 100);
    if (priceCents <= 0 || priceCents > 100000) continue;
    let category, flavor = 'other';
    if (/汉堡|肉堡|牛堡/.test(group.name || '') && (entry.tags || []).includes('单品')) {
      category = 'main';
      flavor = /鸡/.test(meal.name) ? 'chicken' : /鱼/.test(meal.name) ? 'fish' : (entry.tags || []).some(t => /牛肉/.test(t)) ? 'beef' : 'unknown';
    } else if (FIXED_DRINKS.has(meal.name)) category = 'drink';
    else if (FIXED_SIDES.has(meal.name)) category = 'side';
    if (category) items.set(entry.code, { id: entry.code, name: meal.name, category, flavor, priceCents });
  }
  if (!items.size) throw new UserError('此门店暂无可直接用于计算的固定规格单品，请换一家门店或手动核对菜单。', 409);
  const normalized = validateCatalog([...items.values()]);
  if (!normalized.some(i => i.category === 'main')) throw new UserError('此时段没有识别到单品汉堡，试试午晚餐时段。', 409);
  return { items: normalized, excludedCount: Object.keys(data.meals).length - normalized.length };
}
