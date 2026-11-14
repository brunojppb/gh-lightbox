# gh-lightbox verification map

This directory lists the user-facing behavior of gh-lightbox. Read it before you drive the extension, then use the matching feature file as the recipe.

## Baseline preconditions

- `npm install` has run, and `npm run check`, `npm test`, and `npm run -s verify:lifecycle` pass.
- For fixture runs: no network is needed.
- For live runs: https://github.com/brunojppb/gh-lightbox/issues/1 and https://github.com/brunojppb/gh-lightbox/pull/2 exist and are public.

## Features

- [open-image.md](open-image.md). A click on an image opens the lightbox with a morph, and Escape closes it.
- [navigate.md](navigate.md). Arrows, buttons, and thumbnails move through the media of one comment.
- [video.md](video.md). The expand button opens a video, and playback moves between page and lightbox.
- [page-safety.md](page-safety.md). GitHub's own links, shortcuts, and navigation keep working.

## Proof and skip reporting

- Name the feature file and the entry point with every artifact.
- Report an entry point you could not reach, with the command and the reason. Do not count it as verified through another path.
