import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBinders, getBinderCards, getCardValue } from './binderModel.mjs';

test('legacy profiles receive a stable main binder', () => {
  assert.deepEqual(normalizeBinders(null, 'collector'), [{ id: 'collector', name: 'Main Binder', isDefault: true }]);
});

test('normalization removes invalid and duplicate binders and keeps one default', () => {
  assert.deepEqual(normalizeBinders([
    { id: 'one', name: ' Main ', isDefault: true },
    { id: 'one', name: 'Duplicate' },
    { id: 'two', name: 'TCG', isDefault: true },
    { id: '', name: 'Invalid' }
  ]), [{ id: 'one', name: 'Main', isDefault: true }, { id: 'two', name: 'TCG', isDefault: false }]);
});

test('legacy and orphaned assignments remain visible only in the default binder', () => {
  const binders = normalizeBinders([{ id: 'main', name: 'Main' }, { id: 'tcg', name: 'TCG' }]);
  const cards = [{ id: 'legacy' }, { id: 'orphan', binderId: 'gone' }, { id: 'assigned', binderId: 'tcg' }];
  assert.deepEqual(getBinderCards(cards, binders[0], binders).map((card) => card.id), ['legacy', 'orphan']);
  assert.deepEqual(getBinderCards(cards, binders[1], binders).map((card) => card.id), ['assigned']);
});

test('binder values accept persisted currency strings and reject invalid values', () => {
  assert.equal(getCardValue({ tradeValue: '$1,250.50' }), 1250.5);
  assert.equal(getCardValue({ value: 100 }), 100);
  assert.equal(getCardValue({ tradeValue: 'invalid' }), 0);
});