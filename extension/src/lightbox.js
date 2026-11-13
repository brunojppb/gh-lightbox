// @ts-check
import { reduce, keyCommand, CLOSED } from './state.js';
import { morph, slide, veil, unveilAll, cancelAnimations } from './morph.js';

/** @typedef {import('./types.js').Gallery} Gallery */
/** @typedef {import('./types.js').MediaItem} MediaItem */
/** @typedef {import('./state.js').LightboxState} LightboxState */
/** @typedef {import('./state.js').LightboxEvent} LightboxEvent */
/** @typedef {import('./state.js').Effect} Effect */
/** @typedef {import('./morph.js').MorphParts} MorphParts */
/** @typedef {(event: LightboxEvent) => void} Dispatch */

/**
 * @typedef {object} Lightbox
 * @property {(gallery: Gallery) => void} open  Opens the lightbox on `gallery.start`. Does nothing unless the lightbox is closed.
 */

/**
 * The lightbox DOM. `buildView` makes it once. Effects fill it.
 * @typedef {object} View
 * @property {HTMLDialogElement} dialog
 * @property {HTMLElement} backdrop
 * @property {HTMLElement} frame
 * @property {HTMLImageElement} image
 * @property {HTMLVideoElement} video
 * @property {HTMLElement} counter
 * @property {HTMLElement} caption
 * @property {HTMLButtonElement} closeButton
 * @property {HTMLButtonElement} prevButton
 * @property {HTMLButtonElement} nextButton
 * @property {HTMLOListElement} strip
 * @property {MorphParts} parts
 */

/**
 * Builds the lightbox inside `root`. The lightbox handles its own keys, buttons, wheel, and page changes.
 * @param {ShadowRoot} root
 * @returns {Lightbox}
 */
export function createLightbox(root) {
  const host = /** @type {HTMLElement} */ (root.host);
  const view = buildView(root);
  /** @type {LightboxState} */
  let state = CLOSED;
  host.dataset.phase = state.phase;

  /** @type {Dispatch} */
  const dispatch = (event) => {
    const next = reduce(state, event);
    state = next.state;
    // The only writer of data-phase. CSS and the e2e tests read it.
    host.dataset.phase = state.phase;
    try {
      for (const effect of next.effects) run(view, effect, dispatch);
    } catch (error) {
      // A modal dialog that stays open blocks all of GitHub. Fail closed.
      console.error('[gh-lightbox]', error);
      state = CLOSED;
      host.dataset.phase = state.phase;
      teardown(view, null);
    }
  };

  listen(view, () => state.phase, dispatch);
  return { open: (gallery) => dispatch({ type: 'openGallery', gallery }) };
}

/**
 * Runs one effect against the view.
 * @param {View} view
 * @param {Effect} effect
 * @param {Dispatch} dispatch
 * @returns {void}
 */
function run(view, effect, dispatch) {
  switch (effect.type) {
    case 'mount':
      fillStrip(view, effect.gallery);
      view.dialog.showModal();
      return;
    case 'render':
      renderItem(view, effect);
      return;
    case 'morph': {
      const { direction } = effect;
      morph(view.parts, direction, effect.item).addEventListener(
        'finish',
        () => dispatch({ type: 'settled', morph: direction }),
        { once: true },
      );
      return;
    }
    case 'unmount':
      teardown(view, effect.item);
      return;
  }
}

/**
 * Shows an item in the frame, and updates the counter, caption, buttons, and strip.
 * @param {View} view
 * @param {Extract<Effect, { type: 'render' }>} effect
 * @returns {void}
 */
function renderItem(view, effect) {
  const { item, previous, index, count, direction } = effect;
  if (previous?.kind === 'video') handBack(previous, view.video);
  setFrameSize(view.frame, item.kind, item.size);
  view.image.hidden = item.kind !== 'image';
  view.video.hidden = item.kind !== 'video';
  if (item.kind === 'image') {
    view.image.alt = item.caption;
    view.image.src = item.src;
  } else {
    handOver(item, view.video);
  }
  view.counter.textContent = `${index + 1} / ${count}`;
  view.counter.hidden = count === 1;
  view.caption.textContent = item.caption;
  view.caption.hidden = item.caption === '';
  view.prevButton.disabled = index === 0;
  view.nextButton.disabled = index === count - 1;
  for (const button of view.strip.querySelectorAll('button')) {
    button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
  }
  centerInStrip(view.strip, index);
  veil(item.locate());
  if (direction !== 0) slide(view.frame, direction);
}

/**
 * Sets the frame's aspect ratio from the media's natural size, or 16:9 while the size is unknown.
 * An image never grows past its natural width.
 * @param {HTMLElement} frame
 * @param {MediaItem['kind']} kind
 * @param {MediaItem['size']} size
 * @returns {void}
 */
function setFrameSize(frame, kind, size) {
  const { style } = frame;
  style.setProperty('--w', String(size?.width ?? 16));
  style.setProperty('--h', String(size?.height ?? 9));
  if (kind === 'image' && size) style.setProperty('--max-w', `${size.width}px`);
  else style.removeProperty('--max-w');
}

/**
 * Scrolls the strip, and nothing else, so the button at `index` sits in its middle.
 * @param {HTMLElement} strip
 * @param {number} index
 * @returns {void}
 */
function centerInStrip(strip, index) {
  const button = strip.querySelectorAll('button')[index];
  if (!button) return;
  const [a, b] = [button.getBoundingClientRect(), strip.getBoundingClientRect()];
  strip.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
}

/**
 * Moves playback from the page video to the lightbox video: same time, volume, and mute.
 * The page video pauses, so the sound never plays twice.
 * @param {MediaItem} item
 * @param {HTMLVideoElement} stage
 * @returns {void}
 */
function handOver(item, stage) {
  const page = item.locate();
  stage.src = item.src;
  if (page instanceof HTMLVideoElement) {
    stage.currentTime = page.currentTime;
    stage.muted = page.muted;
    stage.volume = page.volume;
    page.pause();
  }
  // Chrome can refuse to play without a gesture. The native controls stay.
  stage.play().catch(() => {});
}

/**
 * Moves the lightbox video's time back to the page video, and stops the lightbox video.
 * @param {MediaItem} item
 * @param {HTMLVideoElement} stage
 * @returns {void}
 */
function handBack(item, stage) {
  const page = item.locate();
  if (page instanceof HTMLVideoElement) page.currentTime = stage.currentTime;
  stage.pause();
  // Dropping the source ends the network request.
  stage.removeAttribute('src');
  stage.load();
}

/**
 * Fills the thumbnail strip with one button for each item.
 * @param {View} view
 * @param {Gallery} gallery
 * @returns {void}
 */
function fillStrip(view, gallery) {
  const { items } = gallery;
  const buttons = items.map((item, i) => {
    const button = el('button', '', { 'data-index': String(i), 'aria-label': `Item ${i + 1} of ${items.length}` });
    if (item.kind === 'image') {
      button.append(el('img', '', { src: item.src, loading: 'lazy', alt: '' }));
    } else {
      const thumb = el('video', '', { src: item.src, preload: 'metadata' });
      thumb.muted = true;
      button.append(thumb);
    }
    const li = el('li');
    li.append(button);
    return li;
  });
  view.strip.replaceChildren(...buttons);
  view.strip.hidden = items.length === 1;
}

/**
 * Connects keys, buttons, wheel, and page changes to `dispatch`.
 * @param {View} view
 * @param {() => LightboxState['phase']} phase
 * @param {Dispatch} dispatch
 * @returns {void}
 */
function listen(view, phase, dispatch) {
  const { dialog } = view;
  // Window capture runs before GitHub's shortcut listeners on document.
  const onKey = (/** @type {KeyboardEvent} */ event) => {
    if (phase() === 'closed') return;
    const command = keyCommand(event);
    // The native video controls handle their own keys. The dialog stops them below.
    if (!command && event.composedPath().includes(view.video)) return;
    // GitHub must not act on j, k, ?, or s behind the lightbox.
    event.stopImmediatePropagation();
    // Space, Tab, and media keys keep their default action.
    if (event.type !== 'keydown' || !command) return;
    event.preventDefault();
    dispatch(command);
  };
  for (const type of ['keydown', 'keyup', 'keypress']) {
    window.addEventListener(type, /** @type {EventListener} */ (onKey), true);
    dialog.addEventListener(type, (event) => event.stopPropagation());
  }

  view.closeButton.addEventListener('click', () => dispatch({ type: 'close' }));
  view.prevButton.addEventListener('click', () => dispatch({ type: 'step', delta: -1 }));
  view.nextButton.addEventListener('click', () => dispatch({ type: 'step', delta: 1 }));
  view.strip.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (button?.dataset.index) dispatch({ type: 'jump', index: Number(button.dataset.index) });
  });
  view.backdrop.addEventListener('click', (event) => {
    // The second click of the double click that opened the lightbox lands here.
    if (event.detail > 1) return;
    dispatch({ type: 'close' });
  });
  dialog.addEventListener('cancel', (event) => {
    // The close morph must run before the dialog closes.
    event.preventDefault();
    dispatch({ type: 'close' });
  });
  // A modal dialog does not stop the page under it from scrolling.
  dialog.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      if (event.target instanceof Node && view.strip.contains(event.target)) {
        view.strip.scrollLeft += event.deltaY + event.deltaX;
      }
    },
    { passive: false },
  );

  // Hash and query changes keep the lightbox open.
  window.navigation?.addEventListener('navigate', (event) => {
    if (new URL(event.destination.url).pathname !== location.pathname) dispatch({ type: 'pageLeft' });
  });
  window.addEventListener('pagehide', () => dispatch({ type: 'pageLeft' }));
}

/**
 * Builds the lightbox DOM inside `root`.
 * @param {ShadowRoot} root
 * @returns {View}
 */
function buildView(root) {
  const dialog = el('dialog', '', { 'aria-label': 'Media viewer' });
  const backdrop = el('div', 'backdrop');
  const counter = el('span', 'counter', { 'aria-live': 'polite' });
  const closeButton = el('button', 'close', { 'aria-label': 'Close' });
  closeButton.textContent = '\u2715';
  const header = el('header');
  header.append(counter, closeButton);

  const image = el('img', 'media', { alt: '' });
  const video = el('video', 'media', { controls: '', playsinline: '' });
  video.hidden = true;
  // The frame takes focus on open. On the close button, Space would close the lightbox.
  const frame = el('div', 'frame', { tabindex: '-1', autofocus: '' });
  frame.append(image, video);
  const stage = el('div', 'stage');
  stage.append(frame);

  const prevButton = el('button', 'prev', { 'aria-label': 'Previous' });
  prevButton.textContent = '\u2039';
  const nextButton = el('button', 'next', { 'aria-label': 'Next' });
  nextButton.textContent = '\u203a';
  const caption = el('p', 'caption', { 'aria-live': 'polite' });
  const strip = el('ol', 'strip');
  const footer = el('footer');
  footer.append(prevButton, caption, nextButton, strip);

  dialog.append(backdrop, header, stage, footer);
  root.append(dialog);

  // The natural size can arrive after the open, when the page had not loaded the media.
  image.addEventListener('load', () => setFrameSize(frame, 'image', { width: image.naturalWidth, height: image.naturalHeight }));
  video.addEventListener('loadedmetadata', () => setFrameSize(frame, 'video', { width: video.videoWidth, height: video.videoHeight }));

  return {
    dialog, backdrop, frame, image, video, counter, caption, closeButton, prevButton, nextButton, strip,
    parts: { frame, backdrop, controls: [header, footer] },
  };
}

/**
 * Makes an element, with attributes.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} [className]
 * @param {Record<string, string>} [attributes]
 * @returns {HTMLElementTagNameMap[K]}
 */
function el(tag, className = '', attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/**
 * Closes the lightbox at once and returns the page to how it was. Each step runs even if an earlier one fails.
 * @param {View} view
 * @param {MediaItem | null} item  The item on show, or null when it is unknown after a failure.
 * @returns {void}
 */
function teardown(view, item) {
  const steps = [
    () => cancelAnimations(view.parts),
    () => (item?.kind === 'video' ? handBack(item, view.video) : view.video.pause()),
    () => unveilAll(),
    () => view.dialog.open && view.dialog.close(),
    () => view.image.removeAttribute('src'),
    () => view.strip.replaceChildren(),
  ];
  for (const step of steps) {
    try {
      step();
    } catch (error) {
      console.error('[gh-lightbox] teardown', error);
    }
  }
}
