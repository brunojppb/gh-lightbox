---
name: verify-gh-lightbox
description: Drive the gh-lightbox Chrome extension in real Chromium, on fixture copies of GitHub pages and on the public test issue and pull request on github.com, and capture screenshots and video as proof. Use after any change to extension/ before you claim it works.
---

# Verify gh-lightbox

gh-lightbox is an unpacked MV3 extension. Its surface is the github.com page: a click on an image, or the expand button on a video, opens a lightbox in a shadow root on a `<gh-lightbox>` element. The host's `data-phase` attribute is the lifecycle phase: `closed`, `opening`, `open`, or `closing`.

There is no server. Each run starts its own Chromium with the extension loaded, so runs never share state.

## Launch

Run all commands from the repo root.

```sh
npm install          # once; dev tools only
npm run e2e          # fixtures: 22 Playwright tests, about 35 s
npm run verify:live  # github.com: 20 checks, about 25 s, needs network
```

- `npm run e2e` routes `https://github.com/acme/widgets/pull/7` and `/issues/1` to `test/e2e/fixtures/*.html`, and blocks every other request. It needs no network and no GitHub session.
- `npm run verify:live` opens https://github.com/brunojppb/gh-lightbox/issues/1 and https://github.com/brunojppb/gh-lightbox/pull/2 signed out. Both pages hold generated media only.
- Ready means the `gh-lightbox` element exists in the page. The scripts wait for it.

Both launch Playwright's `chromium` channel with `--load-extension=extension`. `@playwright/test` is pinned to `~1.57.0`, which uses the cached `chromium-1200` build. That build plays H.264, so the live MP4 videos play.

## Doctor

Run this first when anything looks off:

```sh
npm run check && npm test && npm run -s verify:lifecycle
```

All three must pass before a browser run means anything. If `npm run e2e` cannot start Chromium, run `npx playwright --version` and check that it prints 1.57.x.

## Drive

The scripts drive the app. To check one behavior by hand, copy a test from `test/e2e/lightbox.spec.js`. Use these handles:

- The host: `page.locator('gh-lightbox')`. Wait for a phase with `gh-lightbox[data-phase="open"]`.
- Inside the shadow root (Playwright pierces open roots): `.counter`, `.caption`, `.close`, `.prev`, `.next`, `.strip button`, `video.media`, `img.media`, `.launcher`.
- Page media: `.markdown-body img[alt="Bars"]`, `.markdown-body details video`.
- A video opens only through `.launcher`. Hover the video first, then click the launcher.

The feature map in `features/README.md` lists every user path and the end state that proves it.

## Evidence

- `npm run verify:live` writes `.verify/<run>/`: a PNG for each step (`issue-03-open.png`, `pull-08-video.png`, and so on), `issue.webm` and `pull.webm` recordings, and `report.json` with every check.
- Playwright writes failure traces to `test-results/`.
- Proof standards: drive the real click, key, or hover, never a call into the extension's modules. Capture the page before the action and the lightbox after it. For a close, check that the page element is visible again (opacity 1, no running animation), not only that the dialog went away.
- A pass on fixtures alone does not prove a change against GitHub's live DOM. Run `verify:live` too when the change touches `extension/src/github.js`, the click or key wiring, or the morph.

## Cleanup

Each script closes the browser it started. Nothing else needs to stop. `.verify/` and `test-results/` are git-ignored, and runs never delete them. Remove old runs by hand with `rm -rf .verify/<run>` when you no longer need the proof.

## Helpers

- `scripts/verify-live.mjs` drives the live pages. Run it through `npm run verify:live`. It exits 1 when any check fails.
- `test/e2e/make-fixtures.sh` regenerates the fixture media with ffmpeg. Run it with `bash test/e2e/make-fixtures.sh`.
- The live test pages hold media on the `demo-media` branch and uploads made with `gh issue edit --attach`. Do not merge `demo-media`.
