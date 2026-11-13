// @ts-check
// The shared vocabulary. Types only.

/**
 * @typedef {object} Size
 * @property {number} width
 * @property {number} height
 */

/**
 * A viewport rectangle, as getBoundingClientRect gives it.
 * @typedef {object} Rect
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 */

/**
 * One image or video in a comment, as the lightbox sees it.
 * @typedef {object} MediaItem
 * @property {'image' | 'video'} kind
 * @property {string} src  The URL the page already loaded. Reusing it lets the browser cache serve the lightbox.
 * @property {string} caption  Alt text or file name. Empty when neither says anything.
 * @property {Size | null} size  Natural size. Null when the page has not loaded the media yet.
 * @property {() => Element | null} locate  The page element that shows this item now. Null when GitHub removed it.
 */

/**
 * The media of one comment, and the item the user picked.
 * Only `galleryFor` in github.js builds one, so `items` is never empty and `start` is in range.
 * @typedef {object} Gallery
 * @property {readonly [MediaItem, ...MediaItem[]]} items  Page order.
 * @property {number} start
 */

export {};
