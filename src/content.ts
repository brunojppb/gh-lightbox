// The content script. The build bundles it with every module and the stylesheet into one classic script,
// so the extension exposes no file to the page.
import css from './lightbox.css?inline';
import { galleryFor } from './github.ts';
import { createLightbox } from './lightbox.ts';
import type { Lightbox } from './lightbox.ts';
import { installVideoLauncher } from './launcher.ts';

const HOST_TAG = 'gh-lightbox';

/** Starts gh-lightbox in this document. GitHub's in-page navigations keep this one instance. */
function start(): void {
  if (document.querySelector(HOST_TAG)) return;
  const root = mountHost(css);
  const lightbox = createLightbox(root);
  // Window capture runs before every GitHub click listener on document or below.
  window.addEventListener('click', (event) => openImage(event, lightbox), true);
  installVideoLauncher(root, lightbox.open);
}

/** Opens the lightbox for a plain left click on a review image. Every other click keeps GitHub's behavior. */
function openImage(event: MouseEvent, lightbox: Lightbox): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!(event.target instanceof Element)) return;
  const gallery = galleryFor(event.target);
  // A click on a video belongs to its native controls. The launcher opens videos.
  if (gallery?.items[gallery.start].kind !== 'image') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  lightbox.open(gallery);
}

/** Adds the host element to the page and returns its shadow root. */
function mountHost(styles: string): ShadowRoot {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  const host = document.createElement(HOST_TAG);
  // Open mode lets Playwright reach inside. GitHub has no reason to look.
  const root = host.attachShadow({ mode: 'open' });
  // A constructed sheet is CSSOM, so GitHub's CSP style-src does not apply to it.
  root.adoptedStyleSheets = [sheet];
  // Outside <body>: Turbo replaces <body> on navigation and would drop the host.
  document.documentElement.append(host);
  return root;
}

try {
  start();
} catch (error) {
  console.error('[gh-lightbox] start failed', error);
}
