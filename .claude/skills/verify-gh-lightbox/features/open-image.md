# Open an image

A plain left click on an image in an issue or pull request body or comment opens a full-screen lightbox. The image grows from its place on the page. Escape, the X button, or a click on the dark backdrop closes it, and the image shrinks back.

## Sub-features

- `open-click` opens on a plain left click, with no new tab.
- `open-morph` starts the frame at the page image's rect.
- `close-escape`, `close-x`, `close-backdrop` close the lightbox.
- `close-restore` shows the page image again after close.
- `open-reduced-motion` fades with no transform when the user prefers reduced motion.

## How to get to it (user POV)

- Click an image in the body or in a comment.
- Press Enter on a focused image link.

## Driving it with Playwright

- **Open.** Click `.markdown-body img[alt="Bars"]`. Wait for `gh-lightbox[data-phase="open"]`. `context.pages().length` is unchanged.
- **Content.** `.counter` reads `n / total` and `.caption` reads `Bars`.
- **Close.** Press Escape. Wait for `gh-lightbox[data-phase="closed"]`. The page image has computed opacity `1` and no animations.
- **Proof.** `npm run verify:live` saves `*-01-page.png`, `*-02-opening.png`, `*-03-open.png`, and `*-06-closing.png`.
- e2e: the tests named "a click opens the lightbox", "the open morph starts at the page image rect", "Escape closes", "the X button and the backdrop close it", and "reduced motion".

## Gotchas

- On the live issue page, React can re-render the body right after load and detach the image. The test "an image that GitHub detaches while open" covers the fix. Run the live check more than once after any change to `veil` in `morph.js`.
- The live issue page renders `:tada:` as plain text, so there is no emoji image to click there. The fixture covers `img.emoji`.
