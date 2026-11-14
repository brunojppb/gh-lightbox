# GitHub keeps working

The extension must not take over clicks, keys, or navigation that belong to GitHub.

## Sub-features

- `safe-modifier` keeps Cmd-click and Ctrl-click as open-in-new-tab.
- `safe-links` follows an image the author linked to another site, avatars, and mentions.
- `safe-emoji` opens nothing for emoji images.
- `safe-shortcuts` stops GitHub shortcuts such as `j` while the lightbox is open.
- `safe-navigation` closes the lightbox at once on a path change, and keeps it open on a hash or query change.
- `safe-turbo` still works after Turbo swaps `<body>`.

## How to get to it (user POV)

- Cmd-click an image, click an avatar or a linked image, press `j` with the lightbox open, or follow a link to another issue.

## Driving it with Playwright

- All covered by fixtures in `test/e2e/lightbox.spec.js`: "Cmd-click keeps the new tab", "an emoji click opens no lightbox", "an avatar click follows its link", "an image linked to another site follows the link", "GitHub shortcuts do not fire", "a pushState to another path closes the lightbox", "after a Turbo-style body swap".
- Proof: the Playwright report from `npm run e2e`.

## Gotchas

- None of these paths have a live check yet. The public test pages hold no linked images or avatars inside a body.
