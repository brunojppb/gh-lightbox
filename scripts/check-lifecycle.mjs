// @ts-check
// Bounded model check of the lightbox lifecycle in extension/src/state.js.
// It explores every reachable state for galleries of 1 to MAX_COUNT items, and checks every event in every state.
import { reduce, CLOSED } from '../extension/src/state.js';

/** @typedef {import('../extension/src/types.js').Gallery} Gallery */
/** @typedef {import('../extension/src/state.js').LightboxState} LightboxState */
/** @typedef {import('../extension/src/state.js').LightboxEvent} LightboxEvent */

const MAX_COUNT = 8;

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

/** @param {LightboxState} s */
const key = (s) => (s.phase === 'closed' ? 'closed' : `${s.phase}:${s.index}`);

/**
 * Every event the lightbox can receive for a gallery of `count` items, opened at each start index.
 * @param {number} count
 * @returns {LightboxEvent[]}
 */
function eventsFor(count) {
  /** @type {LightboxEvent[]} */
  const events = [
    { type: 'step', delta: -1 },
    { type: 'step', delta: 1 },
    { type: 'jump', index: -1 },
    { type: 'jump', index: count },
    { type: 'close' },
    { type: 'settled', morph: 'in' },
    { type: 'settled', morph: 'out' },
    { type: 'pageLeft' },
  ];
  for (let i = 0; i < count; i++) {
    events.push({ type: 'jump', index: i }, { type: 'openGallery', gallery: gallery(count, i) });
  }
  return events;
}

/** @type {string[]} */
const failures = [];
/**
 * @param {boolean} ok
 * @param {string} message
 */
const check = (ok, message) => {
  if (!ok && failures.length < 20) failures.push(message);
};

let statesChecked = 0;
let transitionsChecked = 0;
for (let count = 1; count <= MAX_COUNT; count++) {
  const events = eventsFor(count);
  /** @type {Map<string, LightboxState>} */
  const seen = new Map([['closed', CLOSED]]);
  /** @type {Map<string, Set<string>>} Edges, for the liveness check. */
  const edges = new Map();
  const queue = [CLOSED];
  // closed, opening and open and closing at each index. More means the index escaped its range.
  const limit = 1 + 3 * count;
  while (queue.length > 0 && seen.size <= limit) {
    const state = /** @type {LightboxState} */ (queue.shift());
    const out = new Set();
    edges.set(key(state), out);
    for (const event of events) {
      transitionsChecked++;
      const label = `count ${count}, ${key(state)} + ${JSON.stringify({ ...event, gallery: undefined })}`;
      const { state: next, effects } = reduce(state, event);
      const kinds = effects.map((e) => e.type);
      // Safety: the index always points at an item.
      if (next.phase !== 'closed') check(next.index >= 0 && next.index < count, `${label}: index ${next.index} out of range`);
      // Safety: the dialog mounts once per open and unmounts once per close, so no overlay leaks.
      check(kinds.includes('mount') === (state.phase === 'closed' && next.phase !== 'closed'), `${label}: mount without an open`);
      check(kinds.includes('unmount') === (state.phase !== 'closed' && next.phase === 'closed'), `${label}: unmount does not match the close`);
      // Safety: the item never changes mid-morph, or the morph would end on the wrong page element.
      if (state.phase === 'opening' || state.phase === 'closing') check(!kinds.includes('render'), `${label}: item changed mid-morph`);
      // Safety: a morph starts only on the way into opening or closing, so a running morph is never restarted.
      const starts = next.phase !== state.phase && (next.phase === 'opening' || next.phase === 'closing');
      check(kinds.filter((k) => k === 'morph').length === (starts ? 1 : 0), `${label}: morph without a phase start`);
      // Safety: nothing reopens while closing.
      if (state.phase === 'closing') check(next.phase === 'closing' || next.phase === 'closed', `${label}: reopened mid-close`);
      out.add(key(next));
      if (!seen.has(key(next))) {
        seen.set(key(next), next);
        queue.push(next);
      }
    }
  }
  check(seen.size <= limit, `count ${count}: more than ${limit} reachable states, so the index left its range`);
  statesChecked += seen.size;
  // Liveness: from every reachable state, closed is reachable. A state with no path to closed is a stuck overlay.
  const canClose = new Set(['closed']);
  for (let changed = true; changed; ) {
    changed = false;
    for (const [from, tos] of edges) {
      if (!canClose.has(from) && [...tos].some((to) => canClose.has(to))) {
        canClose.add(from);
        changed = true;
      }
    }
  }
  for (const state of seen.keys()) check(canClose.has(state), `count ${count}: ${state} can never reach closed (stuck overlay)`);
  // Liveness: the user can always close with Escape plus the finished morph, not only through a page change.
  for (const state of seen.values()) {
    if (state.phase === 'closed') continue;
    const afterClose = reduce(state, { type: 'close' }).state;
    const end = afterClose.phase === 'closing' ? reduce(afterClose, { type: 'settled', morph: 'out' }).state : afterClose;
    check(end.phase === 'closed', `count ${count}: ${key(state)} does not close on Escape then the finished morph`);
  }
}

if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} violation(s)`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`PASS: ${statesChecked} states and ${transitionsChecked} transitions for galleries of 1 to ${MAX_COUNT} items.`);
