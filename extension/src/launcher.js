// @ts-check
import { galleryFor } from './github.js';

/** @typedef {import('./types.js').Gallery} Gallery */

/** Pixels from the video's top right corner. */
const INSET = 8;
const BUTTON_SIZE = 32;

/**
 * Shows an expand button over a review video while the pointer is on the video.
 * The button opens the video in the lightbox. A click on the video itself still reaches its native controls.
 * @param {ShadowRoot} root
 * @param {(gallery: Gallery) => void} open
 * @returns {void}
 */
export function installVideoLauncher(root, open) {
  const button = document.createElement('button');
  button.className = 'launcher';
  button.hidden = true;
  button.setAttribute('aria-label', 'Open video in lightbox');
  button.append(expandIcon());
  root.append(button);

  /** @type {HTMLVideoElement | null} */
  let video = null;
  const hide = () => {
    button.hidden = true;
    video = null;
  };

  window.addEventListener(
    'pointerover',
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLVideoElement) || target === video || !galleryFor(target)) return;
      video = target;
      const rect = target.getBoundingClientRect();
      button.style.top = `${rect.top + INSET}px`;
      button.style.left = `${rect.right - INSET - BUTTON_SIZE}px`;
      button.hidden = false;
    },
    true,
  );
  window.addEventListener(
    'pointerout',
    // The button sits over the video. Seen from window, the button is root.host.
    (event) => {
      if (event.target === video && event.relatedTarget !== root.host) hide();
    },
    true,
  );
  button.addEventListener('pointerleave', (event) => {
    if (event.relatedTarget !== video) hide();
  });
  // The position is stale after a scroll or resize. The next pointerover places the button again.
  window.addEventListener('scroll', hide, { capture: true, passive: true });
  window.addEventListener('resize', hide);
  button.addEventListener('click', () => {
    const gallery = video && galleryFor(video);
    hide();
    if (gallery) open(gallery);
  });
}

/**
 * Returns the expand icon: two arrows that point to opposite corners.
 * @returns {SVGSVGElement}
 */
function expandIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', 'M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9');
  svg.append(path);
  return svg;
}
