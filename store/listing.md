# Chrome Web Store listing

This file holds the text for the Chrome Web Store dashboard. Copy each part into its field. Change the listing here first, so a pull request reviews it.

## Store listing tab

**Name** comes from `public/manifest.json`: Lightbox for GitHub.

**Summary** comes from the manifest `description` (132 characters maximum).

**Category:** Developer Tools.

**Language:** English.

**Description:**

```text
See the images and videos in GitHub issues and pull requests up close, without leaving the page.

Click an image in a comment. It grows into a full-screen lightbox from its place on the page. Close it, and it shrinks back.

- Click an image to open it. Cmd-click and Ctrl-click still open a new tab.
- Point at a video and click the expand button to open it. The video keeps its time.
- Press the left and right arrow keys to move through the media of a comment.
- Click a thumbnail to jump to it.
- Press Escape, click the X, or click the background to close.

The extension runs only on github.com. It collects no data, sends nothing to any server, and asks for no permissions.

Open source: https://github.com/brunojppb/gh-lightbox
```

**Icon:** `public/icons/icon-128.png`.

**Screenshots** (1280x800): `store/screenshots/*.png`, in file name order.

**Small promo tile** (440x280): `store/promo-tile.png`.

**Homepage URL:** https://github.com/brunojppb/gh-lightbox

**Support URL:** https://github.com/brunojppb/gh-lightbox/issues

`pnpm store:assets` builds the screenshots, the promo tile, and the README banner again. It needs network, because it captures the showcase comment on the demo pull request. `store/CREDITS.md` lists the source and author of each photo and video in that comment.

## Privacy tab

**Single purpose:**

```text
Opens the images and videos in GitHub issues and pull requests in a lightbox on the same page.
```

**Permission justification.** The manifest asks for no permissions. The content script and the web accessible resources match `https://github.com/*` only. If the dashboard asks about host access, use this text:

```text
The content script runs on github.com to find the images and videos in issue and pull request comments, and to show them in a lightbox. It runs on no other site.
```

**Remote code:** No. Every script ships in the package.

**Data usage:** tick no data type. Tick all three statements: no sale of data, no use for other purposes, and no use for credit checks.

**Privacy policy URL:** https://github.com/brunojppb/gh-lightbox/blob/main/PRIVACY.md

## Distribution tab

**Visibility:** Public. **Regions:** All regions.

## Package

`pnpm package` builds `dist/gh-lightbox-v<version>.zip`. Each GitHub release has the same zip. Upload that file. The store needs a higher version for each upload, and Changesets raises the version.
