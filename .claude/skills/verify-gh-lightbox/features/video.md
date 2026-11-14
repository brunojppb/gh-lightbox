# Open a video

A click on a page video still plays it inline. When the pointer is on a video, an expand button appears at its top right. The button opens the video in the lightbox at the same time, volume, and mute state, and the page video pauses. On close or on a step to another item, the time goes back to the page video.

## Sub-features

- `video-inline` keeps the native inline controls.
- `video-launcher` shows the expand button on hover and opens the lightbox.
- `video-handoff` copies time, volume, and mute in both directions.
- `video-keys` lets Space reach the lightbox video.

## How to get to it (user POV)

- Point at a video in a body or comment, then click the expand button.

## Driving it with Playwright

- **Launcher.** Hover `.markdown-body details video`. `.launcher` becomes visible.
- **Open.** Click `.launcher`. Wait for `data-phase="open"`. After about 1.5 s, `video.media` has `readyState >= 2`, no `error`, and `currentTime > 0`.
- **Proof.** `*-07-launcher.png` and `*-08-video.png`, plus `issue.webm` and `pull.webm`.
- e2e: "a video plays inline, and the launcher opens it at the page time", "Space in the lightbox toggles the focused video", "stepping from a video to an image stops the video".

## Gotchas

- Signed video URLs on github.com expire about 5 minutes after the page loads. Reload the page before a slow manual check.
- Keyboard users cannot reach the launcher. This is a known gap.
- The fixture video is WebM. The live videos are H.264 MP4.
