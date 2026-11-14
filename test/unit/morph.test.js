// @ts-check
// morph.js touches the DOM only inside functions, so node can import it for the pure helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformBetween, visibleRect, isOnScreen, sameAspect, springEasing } from '../../extension/src/morph.js';

test('transformBetween maps a rect onto itself with no change', () => {
  const r = { x: 10, y: 20, width: 300, height: 200 };
  assert.equal(transformBetween(r, r), 'translate(0px, 0px) scale(1, 1)');
});

test('transformBetween translates and scales from the layout rect to the target', () => {
  const layout = { x: 100, y: 50, width: 400, height: 300 };
  const target = { x: 20, y: 10, width: 200, height: 150 };
  assert.equal(transformBetween(layout, target), 'translate(-80px, -40px) scale(0.5, 0.5)');
});

test('visibleRect letterboxes a wide video in a tall box, and returns the box for images', () => {
  const box = { x: 0, y: 100, width: 200, height: 400 };
  assert.deepEqual(visibleRect('video', box, { width: 1600, height: 900 }), { x: 0, y: 243.75, width: 200, height: 112.5 });
  assert.equal(visibleRect('image', box, { width: 1600, height: 900 }), box);
  assert.equal(visibleRect('video', box, null), box);
});

test('isOnScreen is false for zero-size rects and rects fully outside the viewport', () => {
  const view = { x: 0, y: 0, width: 800, height: 600 };
  assert.equal(isOnScreen({ x: 10, y: 10, width: 50, height: 50 }, view), true);
  assert.equal(isOnScreen({ x: -40, y: 590, width: 100, height: 100 }, view), true);
  assert.equal(isOnScreen({ x: 10, y: 10, width: 0, height: 50 }, view), false);
  assert.equal(isOnScreen({ x: 10, y: 10, width: 50, height: 0 }, view), false);
  assert.equal(isOnScreen({ x: 0, y: 700, width: 50, height: 50 }, view), false);
  assert.equal(isOnScreen({ x: 800, y: 0, width: 50, height: 50 }, view), false);
  assert.equal(isOnScreen({ x: -60, y: 0, width: 50, height: 50 }, view), false);
});

test('sameAspect allows 5% and no more', () => {
  const frame = { x: 0, y: 0, width: 160, height: 90 };
  assert.equal(sameAspect(frame, { x: 5, y: 5, width: 80, height: 45 }), true);
  assert.equal(sameAspect(frame, { x: 5, y: 5, width: 80, height: 47 }), true);
  assert.equal(sameAspect(frame, { x: 5, y: 5, width: 80, height: 60 }), false);
  assert.equal(sameAspect(frame, { x: 5, y: 5, width: 0, height: 0 }), false);
});

test('springEasing for the beui values starts at 0, ends at 1, never overshoots, and lasts 300 to 600 ms', () => {
  // damping ratio 32 / (2 * sqrt(360 * 0.6)) is about 1.09, so the curve must be monotonic
  const { easing, duration } = springEasing({ stiffness: 360, damping: 32, mass: 0.6 });
  const match = easing.match(/^linear\((.+)\)$/);
  const values = (match?.[1] ?? '').split(', ').map(Number);
  assert.equal(values[0], 0);
  assert.equal(values.at(-1), 1);
  assert.ok(values.length > 10);
  for (let i = 1; i < values.length; i += 1) {
    const [previous, value] = [values[i - 1] ?? 0, values[i] ?? 0];
    assert.ok(value >= previous && value <= 1, `sample ${i}: ${previous} then ${value}`);
  }
  assert.ok(duration >= 300 && duration <= 600, `duration ${duration}`);
});

test('springEasing with low damping overshoots, so the sampler follows the physics', () => {
  const { easing } = springEasing({ stiffness: 360, damping: 4, mass: 0.6 });
  const values = (easing.match(/^linear\((.+)\)$/)?.[1] ?? '').split(', ').map(Number);
  assert.ok(Math.max(...values) > 1);
});
