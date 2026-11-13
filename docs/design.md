# gh-lightbox design

## Problem

On an issue or a pull request, GitHub opens a clicked image in a new tab. The user wants a lightbox on the same page. The media must grow from its place on the page, and shrink back to that place on close. Four facts set the shape:

- GitHub changes pages without a full load. Turbo replaces `<body>`, and React re-renders comments at any time. A listener or a button bound to one element goes stale.
- MV3 content scripts are classic scripts. The user wants typed JavaScript that loads unpacked with no build.
- GitHub has its own CSS, and its own key shortcuts on `document`.
- A user can cut an animation off at any point: a second click, Escape, a page change.

Names used below. A **comment** is one `.markdown-body` block: the issue or PR body, or one comment. The **page element** is the element on GitHub's page that shows a media item. The **frame** is the box in the lightbox that holds the media.

## Usage (caller's view)

README:

```
Install: chrome://extensions → Developer mode → Load unpacked → pick the extension/ folder.

On an issue or a pull request:
- Click an image in a comment. It grows into the lightbox.
- Point at a video. Click the expand button at its top right.
- ← and → move through the media of that comment. Esc closes.
- Cmd-click and Ctrl-click still open a new tab. A click on a video still plays it.

Develop (optional, needs Node):
  npm install     dev tools only; the extension has no dependencies
  npm run check   tsc --noEmit over the // @ts-check sources
  npm test        node --test: state graph, geometry, captions
  npm run e2e     Playwright: the unpacked extension on copies of GitHub pages
```

Call sites. The app needs two calls: `galleryFor(element)` and `lightbox.open(gallery)`.

```js
// extension/src/main.js: a plain left click on a review image
const gallery = galleryFor(event.target);
if (gallery?.items[gallery.start].kind !== 'image') return;
event.preventDefault();            // no new tab
event.stopImmediatePropagation();  // GitHub's click handlers never see it
lightbox.open(gallery);

// extension/src/launcher.js: the expand button over a video
button.addEventListener('click', () => {
  const gallery = video && galleryFor(video);
  hide();
  if (gallery) open(gallery);
});

// test/unit/state.test.js: Escape during the open animation
const { state, effects } = reduce(opening, { type: 'close' });
assert.equal(state.phase, 'closing');
assert.deepEqual(effects.map((e) => e.type), ['morph']);
```

## Shape

### Data

```js
MediaItem = { kind: 'image' | 'video', src, caption, size: Size | null, locate: () => Element | null }
Gallery   = { items: readonly [MediaItem, ...MediaItem[]], start: number }
LightboxState = { phase: 'closed' }
              | { phase: 'opening' | 'open' | 'closing', gallery: Gallery, index: number }
```

`locate()` is the load-bearing field. It returns the page element for the item now, not at click time. GitHub re-renders comments, so the element from click time can leave the document. `locate()` re-finds it by its canonical URL, or returns null. The lightbox never imports GitHub knowledge. It only calls `locate()`.

Only `galleryFor` builds a `Gallery`. The non-empty tuple type and that single builder keep `items` non-empty and `start` in range.

### Modules

| File | Owns | Public surface |
| --- | --- | --- |
| `extension/loader.js` | the only classic script; loads the module graph | none |
| `src/main.js` | the host element, the stylesheet, the image click trigger | `start()` |
| `src/github.js` | every fact about GitHub's markup and URLs | `galleryFor(el)`, `isReviewPage`, `captionFor` |
| `src/state.js` | the lifecycle rules, as a pure reducer | `reduce`, `keyCommand`, `clampIndex`, `CLOSED` |
| `src/lightbox.js` | the dialog DOM, input wiring, effect runner, video handoff | `createLightbox(root).open(gallery)` |
| `src/morph.js` | every Web Animations call and the rect math | `morph`, `slide`, `veil`, `unveilAll`, `cancelAnimations`, pure helpers |
| `src/launcher.js` | the expand button over videos | `installVideoLauncher(root, open)` |
| `src/lightbox.css` | all styles, inside the shadow root | n/a |

Flow: click → `galleryFor` → `lightbox.open` → `reduce` → effects → `morph`. A reader traces any path in three files.

### Fork decisions

| # | Fork | Decision | Why |
| --- | --- | --- | --- |
| 1 | Gallery scope | The comment that holds the clicked media. | The counter means "media in this comment". Arrows never jump to a comment the user is not reading. The close target is almost always on screen. A long PR would give a 100-item gallery. |
| 2 | Video trigger | A hover button, the "launcher". It lives in our shadow root, not in GitHub's DOM. | A click on the video stays with its native controls. Nothing touches React-owned DOM, so re-renders cannot remove or duplicate it. Double-click and modifier-click fight Chrome's own video behavior or nobody finds them. |
| 3 | Script loading | One classic `loader.js` runs `import(chrome.runtime.getURL('src/main.js'))`. `src/*` is web-accessible to `https://github.com/*` only. | Real `import`/`export` makes unexported helpers unreachable (per design-red-flags "importable internals"). No manifest order to keep in sync. `node --test` imports the same files. `tsc` follows real imports. |
| 4 | State | A pure reducer over four phases: `closed`, `opening`, `open`, `closing`. Effects carry all their data. `settled` names its morph (`in` or `out`). | Every hazard becomes one row in a table, and a test can check every row. Item changes do not get a phase: arrows change `index` at once, and the slide is interruptible. A finish event from a cut-off morph cannot end the wrong phase. |
| 5 | Morph | FLIP on the frame with WAAPI: transform from the page rect to the layout rect. Easing is a sampled spring in CSS `linear()` (stiffness 360, damping 32, mass 0.6, from the beui source). Every morph measures where the frame is now, cancels what runs, and starts from there. | Escape during opening uses the same path as a normal close. A video morphs from its letterboxed picture, not its box, so the scale is uniform. Gone, hidden, or off-screen page element: fade and scale to 0.96. Reduced motion: 120 ms fade, no transform. The page never scrolls. |
| 6 | Style isolation | Open shadow root on a `<gh-lightbox>` host appended to `<html>`, not `<body>`. A modal `<dialog>` inside it. `:host { all: initial }`. Keys: one window-capture listener. | The modal dialog sits in the top layer, so no z-index fight. It makes the page inert. Turbo replaces `<body>`, so a host there would vanish. Window capture runs before GitHub's shortcut listeners on `document`. While open, every key event stops there. Only Escape and the arrows also get `preventDefault`, so Space still plays a focused video. |
| 7 | Video handoff | Yes, both ways. Open: copy time, volume, mute; pause the page video; play. Leave the item or close: write the time back. | Restarting at 0:00 loses the user's place. The lightbox reuses the page's URL, so the cache serves it and the seek is fast. |
| 8 | Testing | `node --test` on pure code: an exhaustive check of `reduce` over every reachable state and every event, plus geometry and captions. Playwright loads the unpacked extension and routes `https://github.com/acme/widgets/pull/7` to fixture pages that copy GitHub's DOM. | The reducer state space is finite (4 phases × index), so a full state-graph check proves the lifecycle invariants for every event sequence. The e2e reads `data-phase` on the host, and samples the paused frame animation to check the morph start rect. |

### Invariants and where they live

- **One writer for state.** `dispatch` in `createLightbox` is the only writer. `data-phase` on the host comes from it. CSS and tests read it.
- **One rule for "review media".** `isReviewMedia` in `github.js` decides both what a click opens and what the gallery holds.
- **Rects are measured when a morph starts.** Nothing stores a rect. Scroll and resize cannot make one stale.
- **One veil at a time.** `veil(el)` clears every veil first. Veils are WAAPI opacity animations, so GitHub's `style` attributes stay untouched.
- **A failed effect closes the lightbox.** A modal dialog that stays open blocks all of GitHub. `dispatch` catches, logs, and forces `closed`.
- **Effects never dispatch synchronously.** Only animation `finish` and DOM events dispatch, and both are async. `dispatch` needs no queue.

### What it does not do

No MutationObserver. No edits to GitHub's DOM apart from a WAAPI opacity veil and the video time and pause. No `chrome.*` call after start, and no permissions. No zoom, swipe, download, or wrap-around. No page scroll on close.

### Interface depth

The app sees `galleryFor` and `open`. Behind `open` sit the lifecycle rules, focus, key capture, wheel lock, page-leave detection, video handoff, morph fallback, and failure recovery. Behind `galleryFor` sit page paths, emoji and avatar rules, image-link rules, `animated-image`, captions, and re-location. Each surface is one function. The launcher and the click trigger use the same two calls (per minimize-reader-load).

## Synthesis decision

Two runners sketched the design in parallel. Candidate A (Opus, xhigh effort) became the base. Candidate B (session model) supplied grafts. A cross-judge on Opus scored A higher on lifecycle safety, GitHub coupling, interface depth, beui fidelity, and testability. My own read agreed.

Both candidates converged on the same core: one classic loader that imports ES modules, a shadow root, a pure four-phase reducer, a hover button for videos, a FLIP morph with the Web Animations API, a close on page navigation, and a two-way video handoff. That agreement is strong evidence for the core shape.

Grafts from B:

- `fit` never scales an image above its natural size.
- The close morph fades when the page box and the frame differ in aspect by more than 5%, so a non-uniform scale never stretches the media.
- The gallery leaves out media inside `<form>` and `.js-preview-body` (the comment editor preview).
- The e2e asserts that a click on an image opens no new tab.

Changes from the live GitHub check (see the grounding notes in the session):

- Uploaded media uses signed `private-user-images` URLs with a JWT that expires. A video's `data-canonical-src` holds the same signed URL. `keyOf` uses the asset UUID in the path, then the URL without its query string.
- The video label is the text of `summary span.m-1`. It has no `aria-label`.
- `minimum_chrome_version` is 132, the first version where a content script can import a module from `chrome.runtime.getURL`.

Cleanup: `unmount` and the forced close share one cleanup routine, so the two lists cannot drift.

Rejected from B: a whole-page gallery (it pulls in collapsed and minimized media and makes the strip long), wrap-around at the ends (beui stops at the ends), a closed shadow root (Playwright cannot reach it), and a second shadow host for the video button.

## Tradeoffs accepted

- We accept a web-accessible `src/*` (github.com can detect the extension) in exchange for real ES modules with no build.
- We accept `extension/` as a subfolder in exchange for a loaded folder that holds only extension files, not `node_modules`, tests, or docs.
- We accept that a click before the module loads opens a new tab, as today. In exchange, there is no half-ready state. Listeners exist only after the CSS loads.
- We accept a ~460 ms window during closing where the page is inert, in exchange for a frame that stays in the top layer for the whole morph.
- We accept that arrows always change the item, even when the video has focus. In exchange, the keys never change meaning. Seek with the mouse or the scrubber.
- We accept one frame and an in-slide only (the old item disappears at once), in exchange for one transform owner and simple interruption.
- We accept a spring sampler (about 25 lines) in exchange for the reference's exact feel without a dependency.

## Alternatives considered

- **Classic scripts with a global namespace, and a `Lightbox` class with `isOpen` and `isAnimating` flags.** Simplest to start. It lost because the flags allow states that mean nothing, and each hazard needs its own guard in a different method. Every helper is global, and the manifest list order is a second dependency list.
- **Per-element binding.** A MutationObserver finds media in `.markdown-body`, binds clicks, and inserts an expand button into each video. It lost because it fights React and Turbo re-renders. It also keeps a set of bound elements in sync with the page, and it edits GitHub's DOM.
- **An extension-page iframe as the overlay.** Full CSS and key isolation. It lost because the morph needs page rects and the page's decoded images. Every step would cross a frame boundary by message.
- **The View Transitions API as the morph.** Native shared-element morph. It lost because a transition cannot be cut off by Escape, it pauses page rendering, and it needs `view-transition-name` on GitHub's elements across a shadow boundary.

More per-fork rejections: `alternatives.md`.

## Open questions and risks

- Is the comment the right gallery scope? A PR body "before" image and a comment "after" image then sit in two galleries.
- Should the ends clamp (this design) or wrap?
- Should a video start playing when it becomes the current item? This design plays it.
- Keyboard users cannot reach the video launcher. Does v1 need a key for it?
- Risk: the Navigation API `navigate` event must reach the isolated world for a main-world `pushState`. The e2e checks it. The fallback is `popstate` plus `turbo:visit`.
- Risk: `adoptedStyleSheets` set from the isolated world. The e2e checks it. The fallback is a `<style>` element in the shadow root.
- Risk: the real `animated-image` inner DOM is a guess. Capture one from GitHub before writing the fixture.
- Risk: signed private URLs expire. The lightbox video fails exactly when the page video would. If a re-render changes the URL and there is no `data-canonical-src`, close falls back to a fade.
- Risk: Playwright's Chromium has no H.264. The fixture video must be WebM.

## Next implementation step

Write `state.js` and its exhaustive state-graph test first. Then build the Playwright fixture harness, which also becomes the project's `verify-gh-lightbox` skill.
