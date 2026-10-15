import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOfficialMenu } from '../lib/official-menu.mjs';
const fixture = { structuredContent: { success: true, data: {
  categories: [
    { name: '鸡肉汉堡/卷', meals: [{ code: 'a', tags: ['单品'] }, { code: 'b', tags: ['单品'] }, { code: 'c', tags: ['单品'] }, { code: 'd', tags: ['单品'] }] },
    { name: '饮品', meals: [{ code: 'e' }, { code: 'f' }] },
    { name: '小食', meals: [{ code: 'g' }] }
  ],
  meals: {
    a: { name: '麦香鸡', currentPrice: '17' },
    b: { name: '鸡肉堡单品精选', currentPrice: '10' },
    c: { name: '麦香鸡套餐', currentPrice: '10' },
    d: { name: '板烧鸡腿堡', currentPrice: '10', discountType: '随单购麦金卡优惠', canWithOrder: true },
    e: { name: '纯牛奶(盒装)', currentPrice: '10.5' },
    f: { name: '可乐', currentPrice: '9.5' },
    g: { name: '苹果片', currentPrice: '7' }
  }
} } };
test('official menu excludes bundled, variant and membership-dependent prices', () => {
  const r = normalizeOfficialMenu(fixture);
  assert.deepEqual(r.items.map(x => x.id), ['a', 'e', 'g']);
  assert.equal(r.items[0].flavor, 'chicken'); assert.equal(r.items[1].priceCents, 1050);
  assert.equal(r.excludedCount, 4);
});
test('official business failure and schema drift fail closed', () => {
  assert.throws(() => normalizeOfficialMenu({ structuredContent: { success: false } }));
  assert.throws(() => normalizeOfficialMenu({ structuredContent: { data: [] } }));
});
