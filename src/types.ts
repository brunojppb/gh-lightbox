// The shared vocabulary. Types only.

export interface Size {
  width: number;
  height: number;
}

/** A viewport rectangle, as getBoundingClientRect gives it. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One image or video in a comment, as the lightbox sees it. */
export interface MediaItem {
  kind: 'image' | 'video';
  /** The URL the page already loaded. Reusing it lets the browser cache serve the lightbox. */
  src: string;
  /** Alt text or file name. Empty when neither says anything. */
  caption: string;
  /** Natural size. Null when the page has not loaded the media yet. */
  size: Size | null;
  /** The page element that shows this item now. Null when GitHub removed it. */
  locate: () => Element | null;
}

/**
 * The media of one comment, and the item the user picked.
 * Only `galleryFor` in github.ts builds one, so `items` is never empty and `start` is in range.
 */
export interface Gallery {
  /** Page order. */
  items: readonly [MediaItem, ...MediaItem[]];
  start: number;
}
