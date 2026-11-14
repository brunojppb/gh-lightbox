# Candidate A: options considered and rejected

One line for each rejected option. The rationale's "Alternatives considered" lists the whole-shape options.

| Fork | Rejected option | Why it lost |
| --- | --- | --- |
| 1 Scope | Every media item on the page | Arrows jump between comments the user is not reading. The close target is often off screen. A long PR gives a 100-item gallery, and "Load more" changes the count. |
| 2 Video | Double-click on the video | Chrome toggles fullscreen on double-click, and the first click toggles play. |
| 2 Video | Alt-click or Shift-click | Nobody finds it. |
| 2 Video | Click on the `<summary>` file label | That click collapses the `<details>`. Users depend on it. |
| 2 Video | A button inserted next to each video in GitHub's DOM | Needs a MutationObserver. React and Turbo re-renders remove or duplicate it. |
| 3 Loading | Several classic scripts in manifest order | One global scope makes every helper importable. The manifest order is a second dependency list to keep in sync. `node --test` needs `vm` tricks. |
| 3 Loading | One classic file | About 900 lines, and no clean way to unit-test the pure parts. |
| 3 Loading | CSS as a JS string, or CSS module import | The string loses CSS tooling. `import ... with { type: 'css' }` is new, and node cannot load it. |
| 3 Loading | `<link rel=stylesheet>` in the shadow root | GitHub's CSP `style-src` may block a `chrome-extension://` URL. A constructed sheet is CSSOM, so CSP does not apply. |
| 4 State | `isOpen` and `isAnimating` flags | They allow states that mean nothing, and guards spread over methods. |
| 4 State | A `navigating` phase | It blocks or queues fast arrow presses. An interruptible slide needs no phase. |
| 4 State | `animation.reverse()` for Escape during opening | A reversed spring eases in at the end, which feels wrong. It is also a second close path. |
| 5 Morph | Animate `width`, `height`, `top`, `left` | Layout on every frame, and jank on large images. |
| 5 Morph | View Transitions API | Escape cannot cut it off. It pauses page rendering. It needs names on GitHub elements across a shadow boundary. |
| 5 Morph | Scroll the page to the page element on close | The page position belongs to the user. A jump behind the backdrop confuses. |
| 5 Morph | cubic-bezier instead of a sampled spring | Close enough, but the user pointed at the beui spring. The sampler is small and testable. |
| 6 Style | Prefixed global CSS | GitHub's `button`, `img`, and `.Box` rules leak in. Our rules can hit GitHub. A z-index war with sticky headers. |
| 6 Style | A closed shadow root | Playwright cannot reach inside. GitHub gains nothing from it. |
| 6 Style | `::backdrop` for the blur | WAAPI `pseudoElement: '::backdrop'` support is not certain. A real `.backdrop` div fades with no doubt and takes the close click. |
| 6 Style | Keys on the dialog or on `document` | GitHub's shortcut listeners on `document` would run first or as well. |
| 7 Video | No handoff | The lightbox restarts at 0:00, and both videos can play sound. |
| 8 Test | jsdom unit tests for media collection | A third-party dev runtime that copies GitHub's DOM less well than a real browser on a fixture. |
| Layout | `manifest.json` at the repo root | The loaded folder would also hold `node_modules`, tests, and docs. |
