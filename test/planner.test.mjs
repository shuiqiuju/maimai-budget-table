import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCatalog } from '../lib/demo.mjs';
import { planMeals } from '../lib/planner.mjs';

test('all recommended plans obey total budget, exact cents, quantity and unique combinations', () => {
  for (const people of [1, 2, 3, 6]) for (const budget of [1, 12, 18, 25, 35, 80, 99.99, 500]) for (const requireDrink of [true, false]) {
    const result = planMeals(demoCatalog, { people, budget, requireDrink });
    assert.equal(new Set(result.plans.map(p => p.key)).size, result.plans.length);
    for (const p of result.plans) {
      assert.ok(p.totalCents <= Math.round(budget * 100));
      assert.equal(p.totalCents, p.items.reduce((s, x) => s + x.priceCents * x.quantity, 0));
      assert.equal(p.items.filter(x => x.category === 'main').length, 1);
      assert.ok(p.items.every(x => x.quantity === people));
      if (requireDrink) assert.ok(p.items.some(x => x.category === 'drink'));
      assert.equal(p.remainingCents, Math.round(budget * 100) - p.totalCents);
    }
  }
});
test('lowest cost and insufficient budget are honest', () => {
  assert.equal(planMeals(demoCatalog, { people: 1, budget: 35 }).plans[0].totalCents, 1800);
  const empty = planMeals(demoCatalog, { people: 2, budget: 35 });
  assert.equal(empty.plans.length, 0); assert.equal(empty.minimumCents, 3600);
});
test('main preferences are applied and unknown items do not match', () => {
  const r = planMeals(demoCatalog, { budget: 100, people: 1, preference: 'fish' });
  assert.ok(r.plans.every(p => p.items.find(x => x.category === 'main').flavor === 'fish'));
  assert.equal(planMeals([{ id: '1', name: 'unknown', category: 'main', priceCents: 100 }], { budget: 50, people: 1, preference: 'beef', requireDrink: false }).plans.length, 0);
});
test('bad constraints are rejected rather than silently coerced', () => {
  for (const patch of [{ people: 0 }, { people: 1.5 }, { budget: -5 }, { budget: NaN }, { budget: 1.001 }, { budget: '20' }, { requireDrink: 'false' }]) assert.throws(() => planMeals(demoCatalog, { budget: 35, people: 1, ...patch }));
});
