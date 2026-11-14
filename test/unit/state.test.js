// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reduce, keyCommand, clampIndex, CLOSED } from '../../extension/src/state.js';

/** @typedef {import('../../extension/src/types.js').Gallery} Gallery */
/** @typedef {import('../../extension/src/state.js').LightboxState} LightboxState */
/** @typedef {import('../../extension/src/state.js').LightboxEvent} LightboxEvent */

/**
 * @param {number} count
 * @param {number} start
 * @returns {Gallery}
 */
function gallery(count, start) {
  const item = (/** @type {number} */ i) => ({ kind: /** @type {const} */ ('image'), src: `u${i}`, caption: '', size: null, locate: () => null });
  const [first, ...rest] = Array.from({ length: count }, (_, i) => item(i));
  if (!first) throw new Error('count must be at least 1');
  return { items: [first, ...rest], start };
}

test('openGallery from closed mounts, renders the start item, and morphs in', () => {
  const { state, effects } = reduce(CLOSED, { type: 'openGallery', gallery: gallery(3, 1) });
  assert.equal(state.phase, 'opening');
  assert.deepEqual(effects.map((e) => e.type), ['mount', 'render', 'morph']);
});

/** @type {(count: number, phase: 'opening' | 'open' | 'closing', index?: number) => LightboxState} */
const active = (count, phase, index = 0) => ({ phase, gallery: gallery(count, index), index });

/** @param {import('../../extension/src/state.js').Transition} t */
const types = (t) => t.effects.map((e) => e.type);

test('a second openGallery while not closed does nothing (double click)', () => {
  for (const phase of /** @type {const} */ (['opening', 'open', 'closing'])) {
    const state = active(3, phase);
    const t = reduce(state, { type: 'openGallery', gallery: gallery(2, 0) });
    assert.equal(t.state, state, phase);
    assert.deepEqual(t.effects, [], phase);
  }
});

test('close during opening starts the morph out (Escape during the open animation)', () => {
  const { state, effects } = reduce(active(3, 'opening', 1), { type: 'close' });
  assert.equal(state.phase, 'closing');
  assert.deepEqual(effects.map((e) => e.type), ['morph']);
  assert.equal(effects[0]?.type === 'morph' && effects[0].direction, 'out');
});

test('a settled event for the other morph is ignored', () => {
  for (const [phase, wrong] of /** @type {const} */ ([['opening', 'out'], ['closing', 'in'], ['open', 'in'], ['open', 'out']])) {
    const state = active(2, phase);
    const t = reduce(state, { type: 'settled', morph: wrong });
    assert.equal(t.state, state, `${phase} ${wrong}`);
    assert.deepEqual(t.effects, []);
  }
  assert.equal(reduce(active(2, 'opening'), { type: 'settled', morph: 'in' }).state.phase, 'open');
  assert.equal(reduce(active(2, 'closing'), { type: 'settled', morph: 'out' }).state.phase, 'closed');
});

test('pageLeft from opening, open, and closing unmounts at once', () => {
  for (const phase of /** @type {const} */ (['opening', 'open', 'closing'])) {
    const t = reduce(active(2, phase), { type: 'pageLeft' });
    assert.equal(t.state, CLOSED, phase);
    assert.deepEqual(types(t), ['unmount'], phase);
  }
});

test('step stops at both ends and emits nothing there', () => {
  const first = active(3, 'open', 0);
  assert.deepEqual(reduce(first, { type: 'step', delta: -1 }).effects, []);
  assert.equal(reduce(first, { type: 'step', delta: -1 }).state, first);
  const last = active(3, 'open', 2);
  assert.deepEqual(reduce(last, { type: 'step', delta: 1 }).effects, []);
  const moved = reduce(first, { type: 'step', delta: 1 });
  assert.equal(moved.state.phase === 'open' && moved.state.index, 1);
  const effect = moved.effects[0];
  assert.equal(effect?.type === 'render' && effect.direction, 1);
});

test('step and jump are ignored while opening or closing', () => {
  for (const phase of /** @type {const} */ (['opening', 'closing'])) {
    const state = active(3, phase, 1);
    for (const event of /** @type {LightboxEvent[]} */ ([{ type: 'step', delta: 1 }, { type: 'jump', index: 0 }])) {
      const t = reduce(state, event);
      assert.equal(t.state, state);
      assert.deepEqual(t.effects, []);
    }
  }
});

test('keyCommand maps Escape and arrows, and leaves modified arrows to the browser', () => {
  const plain = { metaKey: false, ctrlKey: false, altKey: false };
  assert.deepEqual(keyCommand({ key: 'Escape', ...plain }), { type: 'close' });
  assert.deepEqual(keyCommand({ key: 'ArrowLeft', ...plain }), { type: 'step', delta: -1 });
  assert.deepEqual(keyCommand({ key: 'ArrowRight', ...plain }), { type: 'step', delta: 1 });
  assert.equal(keyCommand({ key: ' ', ...plain }), null);
  assert.equal(keyCommand({ key: 'j', ...plain }), null);
  for (const mod of ['metaKey', 'ctrlKey', 'altKey']) {
    assert.equal(keyCommand({ key: 'ArrowLeft', ...plain, [mod]: true }), null, mod);
  }
});

test('clampIndex holds the index in range', () => {
  assert.equal(clampIndex(-1, 3), 0);
  assert.equal(clampIndex(3, 3), 2);
  assert.equal(clampIndex(1, 3), 1);
  assert.equal(clampIndex(99, 1), 0);
});

/**
 * @template T
 * @param {T} value
 * @returns {T}
 */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

// The state space is finite: closed, opening at the start index, and open and closing at each index.
// Checking every (reachable state, event) pair covers every event sequence of any length.
test('state graph: every reachable state and every event keeps the invariants', () => {
  for (const count of [1, 3]) {
    const g = gallery(count, Math.floor(count / 2));
    /** @type {LightboxEvent[]} */
    const events = [
      { type: 'openGallery', gallery: g },
      { type: 'step', delta: -1 },
      { type: 'step', delta: 1 },
      { type: 'jump', index: 0 },
      { type: 'jump', index: count - 1 },
      { type: 'jump', index: 99 },
      { type: 'close' },
      { type: 'settled', morph: 'in' },
      { type: 'settled', morph: 'out' },
      { type: 'pageLeft' },
    ];
    /** @param {LightboxState} s */
    const key = (s) => (s.phase === 'closed' ? 'closed' : `${s.phase}:${s.index}`);
    /** @type {Map<string, LightboxState>} */
    const seen = new Map([[key(CLOSED), CLOSED]]);
    const queue = [CLOSED];
    while (queue.length > 0) {
      const state = /** @type {LightboxState} */ (queue.shift());
      deepFreeze(state);
      for (const event of events) {
        const label = `${key(state)} + ${event.type}`;
        const { state: next, effects } = reduce(state, event);
        const kinds = effects.map((e) => e.type);
        if (next.phase !== 'closed') {
          assert.ok(next.index >= 0 && next.index < count, `${label}: index in range`);
        }
        assert.equal(kinds.includes('mount'), state.phase === 'closed' && next.phase === 'opening', `${label}: mount only when opening from closed`);
        assert.equal(kinds.includes('unmount'), state.phase !== 'closed' && next.phase === 'closed', `${label}: unmount iff the dialog goes away`);
        const started = (next.phase === 'opening' || next.phase === 'closing') && next.phase !== state.phase;
        const morphs = effects.filter((e) => e.type === 'morph');
        assert.equal(morphs.length, started ? 1 : 0, `${label}: one morph per start`);
        if (started) {
          const [m] = morphs;
          assert.equal(m?.type === 'morph' && m.direction, next.phase === 'opening' ? 'in' : 'out', `${label}: morph direction`);
        }
        if (state.phase === 'closed' && event.type !== 'openGallery') {
          assert.equal(next, state, `${label}: closed ignores it`);
          assert.deepEqual(effects, [], label);
        }
        if (state.phase === 'closing') {
          assert.ok(next.phase === 'closing' || next.phase === 'closed', `${label}: nothing reopens mid-close`);
        }
        if (!seen.has(key(next))) {
          seen.set(key(next), next);
          queue.push(next);
        }
      }
    }
    const phases = new Set([...seen.values()].map((s) => s.phase));
    assert.deepEqual([...phases].sort(), ['closed', 'closing', 'open', 'opening'], `count ${count}: every phase reached`);
    assert.equal(seen.size, 2 + 2 * count, `count ${count}: closed, opening at start, open and closing at each index`);
  }
});
