// @ts-check
// Every Web Animations call lives in this file. The rect helpers at the bottom are pure.

/** @typedef {import('./types.js').MediaItem} MediaItem */
/** @typedef {import('./types.js').Rect} Rect */
/** @typedef {import('./types.js').Size} Size */

/**
 * The lightbox elements that animate on open and close.
 * @typedef {object} MorphParts
 * @property {HTMLElement} frame  Holds the media. Its transform carries the morph. transform-origin is 0 0.
 * @property {HTMLElement} backdrop
 * @property {readonly HTMLElement[]} controls  Header, buttons, caption, strip.
 */

const FADE = { duration: 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' };
const SLIDE = { duration: 280, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', distance: 40 };
const REDUCED = { duration: 120, easing: 'linear' };
const ASPECT_TOLERANCE = 0.05;
const SPRING_SAMPLES = 40;
const MAX_SPRING_MS = 5000;
const VEIL_ID = 'gh-lightbox-veil';

/** Spring values from the beui image viewer source. */
export const SPRING = springEasing({ stiffness: 360, damping: 32, mass: 0.6 });

/**
 * Animates the frame between the item's page element and the frame's own place, and fades the
 * backdrop and controls with it. Fades instead when the page element is gone, hidden, or off screen,
 * or when the user prefers reduced motion. Starts from where the frame is now, so it can cut off a
 * running morph or slide.
 * @param {MorphParts} parts
 * @param {'in' | 'out'} direction
 * @param {MediaItem} item
 * @returns {Animation}  The frame animation. Its finish ends the phase.
 */
export function morph(parts, direction, item) {
  const current = rectOf(parts.frame);
  // A cut-off animation fires no finish event, so it can never settle the wrong phase.
  cancelAnimations(parts);
  const layout = rectOf(parts.frame);
  const pageElement = item.locate();
  const pageRect = pageElement && visibleRect(item.kind, rectOf(pageElement), item.size);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const timing = reduced ? REDUCED : FADE;
  const from = direction === 'in' ? 0 : 1;
  for (const el of [parts.backdrop, ...parts.controls]) {
    el.animate({ opacity: [from, 1 - from] }, { ...timing, fill: 'forwards' });
  }
  if (reduced) {
    return parts.frame.animate({ opacity: [from, 1 - from] }, { ...timing, fill: 'forwards' });
  }
  const held = transformBetween(layout, current);
  if (!pageRect || !isOnScreen(pageRect, viewport()) || !sameAspect(layout, pageRect)) {
    const shrunk = `${held} scale(0.96)`;
    const frames =
      direction === 'in'
        ? { opacity: [0, 1], transform: [shrunk, held] }
        : { opacity: [1, 0], transform: [held, shrunk] };
    return parts.frame.animate(frames, { ...timing, fill: 'forwards' });
  }
  const page = transformBetween(layout, pageRect);
  // The last frame of the close holds until unmount removes the dialog in the same task.
  return parts.frame.animate(
    { transform: direction === 'in' ? [page, 'none'] : [held, page] },
    { duration: SPRING.duration, easing: SPRING.easing, fill: 'forwards' },
  );
}

/**
 * Slides the frame in from the side the user moved toward.
 * @param {HTMLElement} frame
 * @param {-1 | 1} direction
 * @returns {void}
 */
export function slide(frame, direction) {
  // The latest key press wins.
  for (const animation of frame.getAnimations()) animation.cancel();
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  frame.animate(
    [{ transform: `translateX(${direction * SLIDE.distance}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }],
    { duration: SLIDE.duration, easing: SLIDE.easing },
  );
}

/**
 * Hides a page element while the lightbox shows its media, and shows any element hidden before.
 * GitHub's style attributes stay untouched.
 * @param {Element | null} el
 * @returns {void}
 */
export function veil(el) {
  unveilAll();
  el?.animate({ opacity: [0, 0] }, { duration: 1, fill: 'forwards', id: VEIL_ID });
}

/**
 * Shows every page element that `veil` hid.
 * @returns {void}
 */
export function unveilAll() {
  for (const animation of document.getAnimations()) {
    if (animation.id === VEIL_ID) animation.cancel();
  }
}

/**
 * Stops every lightbox animation without a finish event.
 * @param {MorphParts} parts
 * @returns {void}
 */
export function cancelAnimations(parts) {
  for (const el of [parts.frame, parts.backdrop, ...parts.controls]) {
    for (const animation of el.getAnimations()) animation.cancel();
  }
}

// Pure helpers. Exported for node --test.

/**
 * Returns the CSS transform that puts a box laid out at `layout` onto `target`, with transform-origin 0 0.
 * @param {Rect} layout
 * @param {Rect} target
 * @returns {string}
 */
export function transformBetween(layout, target) {
  const sx = target.width / layout.width;
  const sy = target.height / layout.height;
  return `translate(${target.x - layout.x}px, ${target.y - layout.y}px) scale(${sx}, ${sy})`;
}

/**
 * Returns the part of `box` where the media paints. A video letterboxes inside its box. An image fills it.
 * @param {'image' | 'video'} kind
 * @param {Rect} box
 * @param {Size | null} size  Natural size. Null means the box is the best guess.
 * @returns {Rect}
 */
export function visibleRect(kind, box, size) {
  if (kind === 'image' || !size) return box;
  const scale = Math.min(box.width / size.width, box.height / size.height);
  const width = size.width * scale;
  const height = size.height * scale;
  return { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height };
}

/**
 * Returns true when `rect` has an area and overlaps `viewport`.
 * @param {Rect} rect
 * @param {Rect} viewport
 * @returns {boolean}
 */
export function isOnScreen(rect, viewport) {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    rect.x < viewport.x + viewport.width &&
    rect.x + rect.width > viewport.x &&
    rect.y < viewport.y + viewport.height &&
    rect.y + rect.height > viewport.y
  );
}

/**
 * Returns true when the two rects differ in aspect ratio by at most 5%. A morph between rects that
 * differ more would stretch the media, so the caller fades instead.
 * @param {Rect} a
 * @param {Rect} b
 * @returns {boolean}
 */
export function sameAspect(a, b) {
  return Math.abs(a.width / a.height / (b.width / b.height) - 1) <= ASPECT_TOLERANCE;
}

/**
 * Returns a CSS `linear()` easing and a duration in ms that follow a damped spring from 0 to 1.
 * @param {{ stiffness: number, damping: number, mass: number }} spring
 * @returns {{ easing: string, duration: number }}
 */
export function springEasing({ stiffness, damping, mass }) {
  // WAAPI has no spring timing. linear() plays a sampled one.
  const dt = 0.001;
  const path = [0];
  let x = 0;
  let v = 0;
  while (path.length < MAX_SPRING_MS && !(Math.abs(1 - x) < 0.001 && Math.abs(v) < 0.01)) {
    v += ((-stiffness * (x - 1) - damping * v) / mass) * dt;
    x += v * dt;
    path.push(x);
  }
  const duration = path.length - 1;
  const points = Array.from({ length: SPRING_SAMPLES + 1 }, (_, i) =>
    i === SPRING_SAMPLES ? 1 : (path[Math.round((i / SPRING_SAMPLES) * duration)] ?? 1).toFixed(4),
  );
  return { easing: `linear(${points.join(', ')})`, duration };
}

/**
 * @param {Element} el
 * @returns {Rect}
 */
function rectOf(el) {
  const { x, y, width, height } = el.getBoundingClientRect();
  return { x, y, width, height };
}

/** @returns {Rect} */
function viewport() {
  return { x: 0, y: 0, width: innerWidth, height: innerHeight };
}
