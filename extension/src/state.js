// @ts-check
// The lightbox lifecycle as a pure reducer. No DOM in this file, so node --test can load it.

/** @typedef {import('./types.js').Gallery} Gallery */
/** @typedef {import('./types.js').MediaItem} MediaItem */

/**
 * @typedef {{ phase: 'closed' }} ClosedState
 * @typedef {{ phase: 'opening' | 'open' | 'closing', gallery: Gallery, index: number }} ActiveState
 * @typedef {ClosedState | ActiveState} LightboxState
 */

/**
 * An input to the lightbox. `settled` names the morph that finished,
 * so a late finish from a cut-off morph cannot end the wrong phase.
 * @typedef {{ type: 'openGallery', gallery: Gallery }
 *   | { type: 'step', delta: -1 | 1 }
 *   | { type: 'jump', index: number }
 *   | { type: 'close' }
 *   | { type: 'settled', morph: 'in' | 'out' }
 *   | { type: 'pageLeft' }} LightboxEvent
 */

/**
 * Work for the view. Each effect carries all its data, so the view keeps no copy of the state.
 * @typedef {{ type: 'mount', gallery: Gallery }
 *   | { type: 'render', item: MediaItem, previous: MediaItem | null, index: number, count: number, direction: -1 | 0 | 1 }
 *   | { type: 'morph', direction: 'in' | 'out', item: MediaItem }
 *   | { type: 'unmount', item: MediaItem }} Effect
 */

/** @typedef {{ state: LightboxState, effects: readonly Effect[] }} Transition */

/** @type {LightboxState} */
export const CLOSED = Object.freeze({ phase: 'closed' });

/**
 * Returns the next state and the effects for one event.
 * An event that the table does not list returns the same state and no effects.
 *
 * | phase                   | event        | next    | effects                                 |
 * | ----------------------- | ------------ | ------- | --------------------------------------- |
 * | closed                  | openGallery  | opening | mount, render(start, direction 0), morph in |
 * | opening                 | settled in   | open    | none                                    |
 * | open                    | step, jump   | open    | render(new index), only if it moved     |
 * | opening, open           | close        | closing | morph out                               |
 * | closing                 | settled out  | closed  | unmount                                 |
 * | opening, open, closing  | pageLeft     | closed  | unmount                                 |
 *
 * Rows it leaves out on purpose: openGallery while not closed (a double click),
 * step or jump while opening or closing (the frame size must not change mid-morph),
 * close while closing, and any settled that does not match the phase.
 *
 * @param {LightboxState} state
 * @param {LightboxEvent} event
 * @returns {Transition}
 */
export function reduce(state, event) {
  /** @type {Transition} */
  const same = { state, effects: [] };
  if (state.phase === 'closed') {
    if (event.type !== 'openGallery') return same;
    const { gallery } = event;
    const index = gallery.start;
    const item = gallery.items[index];
    return {
      state: { phase: 'opening', gallery, index },
      effects: [
        { type: 'mount', gallery },
        { type: 'render', item, previous: null, index, count: gallery.items.length, direction: 0 },
        { type: 'morph', direction: 'in', item },
      ],
    };
  }
  const { gallery, index } = state;
  const item = gallery.items[index];
  const count = gallery.items.length;
  switch (event.type) {
    case 'pageLeft':
      return { state: CLOSED, effects: [{ type: 'unmount', item }] };
    case 'settled':
      if (state.phase === 'opening' && event.morph === 'in') return { state: { ...state, phase: 'open' }, effects: [] };
      if (state.phase === 'closing' && event.morph === 'out') return { state: CLOSED, effects: [{ type: 'unmount', item }] };
      return same;
    case 'close':
      if (state.phase === 'closing') return same;
      return { state: { ...state, phase: 'closing' }, effects: [{ type: 'morph', direction: 'out', item }] };
    case 'step':
    case 'jump': {
      if (state.phase !== 'open') return same;
      const next = clampIndex(event.type === 'step' ? index + event.delta : event.index, count);
      if (next === index) return same;
      return {
        state: { ...state, index: next },
        effects: [{ type: 'render', item: gallery.items[next], previous: item, index: next, count, direction: next > index ? 1 : -1 }],
      };
    }
    default:
      return same;
  }
}

/**
 * Returns the lightbox event for a key press, or null when the lightbox does not use the key.
 * @param {Pick<KeyboardEvent, 'key' | 'metaKey' | 'ctrlKey' | 'altKey'>} key
 * @returns {LightboxEvent | null}
 */
export function keyCommand(key) {
  // Modified arrows are browser shortcuts (history back, word jump).
  if (key.metaKey || key.ctrlKey || key.altKey) return null;
  switch (key.key) {
    case 'Escape':
      return { type: 'close' };
    case 'ArrowLeft':
      return { type: 'step', delta: -1 };
    case 'ArrowRight':
      return { type: 'step', delta: 1 };
    default:
      return null;
  }
}

/**
 * Returns `index` held inside `[0, count)`. The ends do not wrap.
 * @param {number} index
 * @param {number} count  At least 1.
 * @returns {number}
 */
export function clampIndex(index, count) {
  return Math.min(Math.max(index, 0), count - 1);
}
