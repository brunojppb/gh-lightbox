import { reduce, keyCommand, CLOSED } from './state.ts';
import { morph, slide, veil, unveilAll, cancelAnimations } from './morph.ts';

import type { Gallery, MediaItem } from './types.ts';
import type { LightboxState, LightboxEvent, Effect } from './state.ts';
import type { MorphParts } from './morph.ts';

type Dispatch = (event: LightboxEvent) => void;

export interface Lightbox {
  /** Opens the lightbox on `gallery.start`. Does nothing unless the lightbox is closed. */
  open: (gallery: Gallery) => void;
}

/** The lightbox DOM. `buildView` makes it once. Effects fill it. */
interface View {
  dialog: HTMLDialogElement;
  backdrop: HTMLElement;
  frame: HTMLElement;
  image: HTMLImageElement;
  video: HTMLVideoElement;
  counter: HTMLElement;
  caption: HTMLElement;
  closeButton: HTMLButtonElement;
  prevButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  strip: HTMLOListElement;
  parts: MorphParts;
}

const PAGE_SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/**
 * Builds the lightbox inside `root`. The lightbox handles its own keys, buttons, wheel, and page changes.
 */
export function createLightbox(root: ShadowRoot): Lightbox {
  const host = root.host as HTMLElement;
  const view = buildView(root);
  let state: LightboxState = CLOSED;
  host.dataset.phase = state.phase;

  const dispatch: Dispatch = (event) => {
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
 */
function run(view: View, effect: Effect, dispatch: Dispatch): void {
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
 */
function renderItem(view: View, effect: Extract<Effect, { type: 'render' }>): void {
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
  const focused = (view.dialog.getRootNode() as ShadowRoot).activeElement;
  view.prevButton.disabled = index === 0;
  view.nextButton.disabled = index === count - 1;
  // A disabled button drops focus to the inert body, and Space then scrolls the page.
  if ((focused === view.prevButton || focused === view.nextButton) && (focused as HTMLButtonElement).disabled) {
    view.frame.focus();
  }
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
 */
function setFrameSize(frame: HTMLElement, kind: MediaItem['kind'], size: MediaItem['size']): void {
  const { style } = frame;
  style.setProperty('--w', String(size?.width ?? 16));
  style.setProperty('--h', String(size?.height ?? 9));
  if (kind === 'image' && size) style.setProperty('--max-w', `${size.width}px`);
  else style.removeProperty('--max-w');
}

/**
 * Scrolls the strip, and nothing else, so the button at `index` sits in its middle.
 */
function centerInStrip(strip: HTMLElement, index: number): void {
  const button = strip.querySelectorAll('button')[index];
  if (!button) return;
  const [a, b] = [button.getBoundingClientRect(), strip.getBoundingClientRect()];
  strip.scrollLeft += a.left + a.width / 2 - (b.left + b.width / 2);
}

/**
 * Moves playback from the page video to the lightbox video: same time, volume, and mute.
 * The page video pauses, so the sound never plays twice.
 */
function handOver(item: MediaItem, stage: HTMLVideoElement): void {
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
 */
function handBack(item: MediaItem, stage: HTMLVideoElement): void {
  const page = item.locate();
  if (page instanceof HTMLVideoElement) page.currentTime = stage.currentTime;
  stage.pause();
  // Dropping the source ends the network request.
  stage.removeAttribute('src');
  stage.load();
}

/**
 * Fills the thumbnail strip with one button for each item.
 */
function fillStrip(view: View, gallery: Gallery): void {
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
 */
function listen(view: View, phase: () => LightboxState['phase'], dispatch: Dispatch): void {
  const { dialog } = view;
  // Window capture runs before GitHub's shortcut listeners on document.
  const onKey = (event: KeyboardEvent) => {
    if (phase() === 'closed') return;
    const command = keyCommand(event);
    const path = event.composedPath();
    // The native video controls handle their own keys. The dialog stops them below.
    if (!command && path.includes(view.video)) return;
    // GitHub must not act on j, k, ?, or s behind the lightbox.
    event.stopImmediatePropagation();
    if (event.type !== 'keydown') return;
    if (!command) {
      // The dialog does not stop the page behind it from scrolling. A focused lightbox button keeps Space.
      const onButton = path.some((node) => node instanceof HTMLButtonElement);
      if (PAGE_SCROLL_KEYS.has(event.key) && !(event.key === ' ' && onButton)) event.preventDefault();
      return;
    }
    event.preventDefault();
    dispatch(command);
  };
  for (const type of ['keydown', 'keyup', 'keypress'] as const) {
    window.addEventListener(type, onKey, true);
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
 */
function buildView(root: ShadowRoot): View {
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
  const prevButton = el('button', 'prev', { 'aria-label': 'Previous' });
  prevButton.textContent = '\u2039';
  const nextButton = el('button', 'next', { 'aria-label': 'Next' });
  nextButton.textContent = '\u203a';
  // The viewer takes the frame's size, so the buttons sit beside the media.
  const viewer = el('div', 'viewer');
  viewer.append(prevButton, frame, nextButton);
  const stage = el('div', 'stage');
  stage.append(viewer);
  const caption = el('p', 'caption', { 'aria-live': 'polite' });
  const strip = el('ol', 'strip');
  const footer = el('footer');
  footer.append(caption, strip);

  dialog.append(backdrop, header, stage, footer);
  root.append(dialog);

  // The natural size can arrive after the open, when the page had not loaded the media.
  image.addEventListener('load', () =>
    setFrameSize(frame, 'image', { width: image.naturalWidth, height: image.naturalHeight }),
  );
  video.addEventListener('loadedmetadata', () =>
    setFrameSize(frame, 'video', { width: video.videoWidth, height: video.videoHeight }),
  );

  return {
    dialog,
    backdrop,
    frame,
    image,
    video,
    counter,
    caption,
    closeButton,
    prevButton,
    nextButton,
    strip,
    parts: { frame, backdrop, controls: [header, prevButton, nextButton, footer] },
  };
}

/** Makes an element, with attributes. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className = '',
  attributes: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) element.className = className;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  return element;
}

/**
 * Closes the lightbox at once and returns the page to how it was. Each step runs even if an earlier one fails.
 * @param item The item on show, or null when it is unknown after a failure.
 */
function teardown(view: View, item: MediaItem | null): void {
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
