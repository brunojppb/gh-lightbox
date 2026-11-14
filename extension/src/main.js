// @ts-check
import { galleryFor } from './github.js';
import { createLightbox } from './lightbox.js';
import { installVideoLauncher } from './launcher.js';

/** @typedef {import('./lightbox.js').Lightbox} Lightbox */

const HOST_TAG = 'gh-lightbox';

/**
 * Starts gh-lightbox in this document. GitHub's in-page navigations keep this one instance.
 * @returns {Promise<void>}
 */
export async function start() {
  if (document.querySelector(HOST_TAG)) return;
  const sheet = await loadSheet();
  const root = mountHost(sheet);
  const lightbox = createLightbox(root);
  // Window capture runs before every GitHub click listener on document or below.
  window.addEventListener('click', (event) => openImage(event, lightbox), true);
  installVideoLauncher(root, lightbox.open);
}

/**
 * Opens the lightbox for a plain left click on a review image. Every other click keeps GitHub's behavior.
 * @param {MouseEvent} event
 * @param {Lightbox} lightbox
 * @returns {void}
 */
function openImage(event, lightbox) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const gallery = galleryFor(event.target);
  // A click on a video belongs to its native controls. The launcher opens videos.
  if (gallery?.items[gallery.start].kind !== 'image') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  lightbox.open(gallery);
}

/**
 * Returns the lightbox stylesheet.
 * @returns {Promise<CSSStyleSheet>}
 */
async function loadSheet() {
  const response = await fetch(new URL('./lightbox.css', import.meta.url));
  if (!response.ok) throw new Error(`lightbox.css: HTTP ${response.status}`);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(await response.text());
  return sheet;
}

/**
 * Adds the host element to the page and returns its shadow root.
 * @param {CSSStyleSheet} sheet
 * @returns {ShadowRoot}
 */
function mountHost(sheet) {
  const host = document.createElement(HOST_TAG);
  // Open mode lets Playwright reach inside. GitHub has no reason to look.
  const root = host.attachShadow({ mode: 'open' });
  // A constructed sheet is CSSOM, so GitHub's CSP style-src does not apply to it.
  root.adoptedStyleSheets = [sheet];
  // Outside <body>: Turbo replaces <body> on navigation and would drop the host.
  document.documentElement.append(host);
  return root;
}
