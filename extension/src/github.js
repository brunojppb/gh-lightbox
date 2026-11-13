// @ts-check
// Every fact about GitHub's markup and URLs lives in this file.
// The rest of the extension sees only MediaItem and Gallery.

/** @typedef {import('./types.js').MediaItem} MediaItem */
/** @typedef {import('./types.js').Gallery} Gallery */

const REVIEW_PAGE = /^\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+(?:\/|$)/;
const COMMENT = '.markdown-body';
const MEDIA = 'img, video';
/** Rendered images smaller than this on both sides are icons or badges. */
const MIN_SIDE = 24;
/** GitHub's uploader writes these alt texts. They say nothing about the image. */
const GENERIC_ALT = /^(?:|image)$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const NAMED_FILE = /\.[a-z0-9]{2,5}$/i;
/** Hosts that serve uploaded or proxied images. A link to one of these is GitHub's own wrapper. */
const IMAGE_HOSTS = [
  'private-user-images.githubusercontent.com',
  'user-images.githubusercontent.com',
  'camo.githubusercontent.com',
];

/**
 * Returns true for an issue page, a pull request page, and the subpages of a pull request.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isReviewPage(pathname) {
  return REVIEW_PAGE.test(pathname);
}

/**
 * Returns the gallery for the media at `target`: every review image and video in the same comment,
 * in page order, starting at the one at `target`.
 * Returns null when `target` is not review media on an issue or pull request page.
 * @param {Element} target  An img, a video, the link around an image, or an img inside animated-image.
 * @returns {Gallery | null}
 */
export function galleryFor(target) {
  if (!isReviewPage(location.pathname)) return null;
  const picked = pageElementAt(target);
  if (!picked || !isReviewMedia(picked)) return null;
  const comment = picked.closest(COMMENT);
  if (!comment) return null;
  const found = [...comment.querySelectorAll(MEDIA)].map(pageElementAt).filter((el) => el !== null);
  const elements = [...new Set(found)].filter(isReviewMedia);
  const start = elements.indexOf(picked);
  const [first, ...rest] = elements.map(toItem);
  if (!first || start < 0) return null;
  return { items: [first, ...rest], start };
}

/**
 * Returns the caption for a media item: meaningful alt text, then the file label GitHub prints
 * above a video, then the file name in the URL. Empty when none applies.
 * @param {{ alt: string, label: string, url: string }} parts
 * @returns {string}
 */
export function captionFor({ alt, label, url }) {
  const text = alt.trim();
  if (!GENERIC_ALT.test(text)) return text;
  if (label.trim()) return label.trim();
  return fileNameIn(url);
}

/**
 * Returns the string that names an uploaded asset across GitHub re-renders: the asset UUID in the path,
 * else the URL without its query and hash. Signed URLs change on every render, so the URL alone is no key.
 * @param {string} url
 * @returns {string}
 */
export function assetKey(url) {
  const bare = url.split(/[?#]/)[0] ?? '';
  return bare.match(UUID)?.[0].toLowerCase() ?? bare;
}

/**
 * @param {string} url
 * @returns {string}
 */
function fileNameIn(url) {
  try {
    const last = decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '');
    // Upload URLs end in a UUID or an id-UUID pair. That is not a name a person chose.
    return NAMED_FILE.test(last) && !UUID.test(last) ? last : '';
  } catch {
    return '';
  }
}

/**
 * Returns the page element that stands for the media at `target`, or null.
 * An image link, an image, and an image inside animated-image all stand for one element.
 * @param {Element} target
 * @returns {Element | null}
 */
function pageElementAt(target) {
  // Enter on a focused image link fires the click on the link, not on the image.
  if (target instanceof HTMLAnchorElement) {
    const images = target.querySelectorAll('img');
    return images.length === 1 && images[0] ? pageElementAt(images[0]) : null;
  }
  if (target instanceof HTMLImageElement) return target.closest('animated-image') ?? target;
  if (target instanceof HTMLVideoElement || target.localName === 'animated-image') return target;
  // Anything else, such as the animated-image play button, keeps GitHub's own behavior.
  return null;
}

/**
 * Returns the img inside animated-image, or `el` itself.
 * @param {Element} el
 * @returns {Element}
 */
function mediaOf(el) {
  return el.localName === 'animated-image' ? (el.querySelector('img') ?? el) : el;
}

/**
 * Returns true for media a reviewer wants to see large. Clicks and gallery collection share this rule.
 * @param {Element} el  A page element from pageElementAt.
 * @returns {boolean}
 */
function isReviewMedia(el) {
  const media = mediaOf(el);
  const comment = el.closest(COMMENT);
  if (!comment || el.closest('form, .js-preview-body')) return false;
  // Ancestors count only inside the comment. Containers around it can carry any class.
  const inside = (/** @type {string} */ selector) => {
    const hit = media.closest(selector);
    return hit !== null && hit !== comment && comment.contains(hit);
  };
  if (media.matches('img.emoji') || inside('g-emoji')) return false;
  if (inside('.avatar, [class*="avatar"]')) return false;
  if (inside('a.user-mention, [data-hovercard-type]')) return false;
  const link = el.closest('a');
  // A link the author wrote must keep its destination. GitHub's own wrapper is not one.
  if (link && comment.contains(link) && !isUploadLink(link, media)) return false;
  // A closed <details> has no box. Its media stays in the gallery.
  if (el.getClientRects().length > 0) {
    const { width, height } = el.getBoundingClientRect();
    if (width < MIN_SIDE && height < MIN_SIDE) return false;
  }
  return true;
}

/**
 * Returns true when `link` is the wrapper GitHub puts around an uploaded or proxied image.
 * @param {HTMLAnchorElement} link
 * @param {Element} media
 * @returns {boolean}
 */
function isUploadLink(link, media) {
  const sources = [media.getAttribute('src'), media.getAttribute('data-canonical-src')];
  if (sources.some((source) => source && new URL(source, document.baseURI).href === link.href)) return true;
  try {
    const { host, pathname } = new URL(link.href);
    return IMAGE_HOSTS.includes(host) || pathname.startsWith('/user-attachments/assets/');
  } catch {
    return false;
  }
}

/**
 * Returns the MediaItem for a page element.
 * @param {Element} el  A page element that passed isReviewMedia.
 * @returns {MediaItem}
 */
function toItem(el) {
  const media = mediaOf(el);
  const locate = locator(el);
  if (media instanceof HTMLVideoElement) {
    const src = media.currentSrc || media.src;
    const label = media.closest('details')?.querySelector('summary span.m-1')?.textContent ?? '';
    const size = media.videoWidth > 0 ? { width: media.videoWidth, height: media.videoHeight } : null;
    return { kind: 'video', src, caption: captionFor({ alt: '', label, url: src }), size, locate };
  }
  const image = /** @type {HTMLImageElement} */ (media);
  const src = image.currentSrc || image.src;
  const size = image.naturalWidth > 0 ? { width: image.naturalWidth, height: image.naturalHeight } : null;
  return { kind: 'image', src, caption: captionFor({ alt: image.alt, label: '', url: src }), size, locate };
}

/**
 * Returns a function that finds the page element for `el` at call time.
 * @param {Element} el
 * @returns {() => Element | null}
 */
function locator(el) {
  const key = keyOf(el);
  return () => {
    if (el.isConnected) return el;
    for (const media of document.querySelectorAll(`${COMMENT} :is(${MEDIA})`)) {
      const page = pageElementAt(media);
      if (page && keyOf(page) === key) return page;
    }
    return null;
  };
}

/**
 * Returns the key that names a page element across GitHub re-renders.
 * @param {Element} el
 * @returns {string}
 */
function keyOf(el) {
  const media = mediaOf(el);
  const urls = [media.getAttribute('data-canonical-src'), media.getAttribute('src')].filter((url) => url !== null);
  const withUuid = urls.find((url) => UUID.test(url.split(/[?#]/)[0] ?? ''));
  return assetKey(withUuid ?? urls[0] ?? '');
}
