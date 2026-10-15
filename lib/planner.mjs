export class UserError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function validateCatalog(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 120) throw new UserError('菜单需包含 1–120 个餐品。');
  const ids = new Set();
  return items.map(item => {
    if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw new UserError('餐品编号缺失或重复。');
    ids.add(item.id);
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 100) throw new UserError('餐品名称无效。');
    if (!['main', 'side', 'drink'].includes(item.category)) throw new UserError('请确认每个餐品的分类。');
    if (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0 || item.priceCents > 100000) throw new UserError('价格必须是有效的正数，最高 1000 元。');
    return { id: item.id, name: item.name, category: item.category, priceCents: item.priceCents, flavor: item.flavor || 'unknown' };
  });
}

export function planMeals(catalog, input) {
  const items = validateCatalog(catalog);
  const { budget, people, preference = 'any', requireDrink = true } = input;
  if (typeof budget !== 'number' || !Number.isFinite(budget) || budget < 1 || budget > 500 || Math.abs(budget * 100 - Math.round(budget * 100)) > 1e-7) throw new UserError('总预算需为 1–500 元，最多两位小数。');
  if (!Number.isInteger(people) || people < 1 || people > 6) throw new UserError('人数需为 1–6 人。');
  if (!['any', 'chicken', 'beef', 'fish'].includes(preference) || typeof requireDrink !== 'boolean') throw new UserError('搭配偏好无效。');
  const budgetCents = Math.round(budget * 100);
  const mains = items.filter(x => x.category === 'main' && (preference === 'any' || x.flavor === preference));
  const sides = [null, ...items.filter(x => x.category === 'side')];
  const drinks = [...(requireDrink ? [] : [null]), ...items.filter(x => x.category === 'drink')];
  const candidates = [];
  let minimum = Infinity;
  // Same set per person: bounded exhaustive search; currency stays in integer cents.
  for (const main of mains) for (const side of sides) for (const drink of drinks) {
    const foods = [main, side, drink].filter(Boolean);
    const totalCents = foods.reduce((sum, x) => sum + x.priceCents, 0) * people;
    minimum = Math.min(minimum, totalCents);
    if (totalCents <= budgetCents) candidates.push({
      key: foods.map(x => x.id).join('|'), mainId: main.id,
      items: foods.map(x => ({ ...x, quantity: people })), totalCents,
      remainingCents: budgetCents - totalCents,
      perPersonCents: totalCents / people, count: foods.length
    });
  }
  const cheap = (a, b) => a.totalCents - b.totalCents || a.key.localeCompare(b.key);
  candidates.sort(cheap);
  const selected = [];
  const take = (candidate, title, reason) => {
    if (candidate) selected.push({ ...candidate, title, reason });
  };
  take(candidates[0], '省一点', '在当前菜单与条件内，选择总价最低的搭配。');
  const remaining = () => candidates.filter(x => !selected.some(s => s.key === x.key));
  take(remaining().sort((a, b) => b.count - a.count || cheap(a, b))[0], '丰富一点', '优先包含更多餐品类别，同样丰富时选价格更低的。');
  take(remaining().filter(x => !selected.some(s => s.mainId === x.mainId)).sort(cheap)[0] || remaining().sort(cheap)[0], '换个口味', '优先换一种主食，给选择困难多一个答案。');
  return { plans: selected, candidateCount: candidates.length, budgetCents, people,
    minimumCents: Number.isFinite(minimum) ? minimum : null,
    message: selected.length ? '' : !mains.length ? '当前菜单没有符合口味的主食，试试「都可以」。' : !drinks.length ? '当前菜单没有饮品，请取消「每人配饮品」或补充菜单。' : `当前条件至少需要 ¥${(minimum / 100).toFixed(2)}，试试提高预算或取消饮品。`
  };
}
