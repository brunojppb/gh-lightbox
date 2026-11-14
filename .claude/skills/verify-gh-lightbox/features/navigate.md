# Move through the media

The lightbox shows the media of the clicked comment only: the issue or PR body, or one comment. The user moves with the arrow keys, the prev and next buttons, or the thumbnail strip. Movement stops at both ends.

## Sub-features

- `nav-keys` moves with ArrowLeft and ArrowRight.
- `nav-buttons` moves with `.prev` and `.next`. A button is disabled at its end.
- `nav-strip` jumps with a thumbnail.
- `nav-scope` keeps each comment as its own gallery.

## How to get to it (user POV)

- Open the lightbox on any image, then press the arrows, click the buttons, or click a thumbnail.

## Driving it with Playwright

- **Keys.** Open on `Bars`. Press ArrowRight. `.caption` reads `Test source`.
- **Strip.** Click the last `.strip button`. `.counter` reads `total / total`, and `.next` is disabled.
- **Scope.** Open on `.markdown-body img[alt="Comment image"]`. `.counter` and `.strip` are hidden, because the comment holds one image.
- **Proof.** `*-04-next.png`, `*-05-last.png`, and `*-09-comment.png` from `npm run verify:live`.

## Gotchas

- The live body holds 8 items: 3 videos and 5 images, in page order. `Bars` is item 3.
- Arrow keys always move, even when the lightbox video has focus. Seek with the video's scrubber.
