---
name: verify-lightbox-lifecycle
description: Bounded model check of the gh-lightbox lifecycle reducer (extension/src/state.js). Proves for every event sequence, on galleries of 1 to 8 items, that the overlay can always close, never leaks a mount, never restarts a morph, and never changes the item mid-morph. Use when a change touches state.js or the effects that lightbox.js runs.
---

# Verify the lightbox lifecycle

## What it proves

The lightbox is a modal dialog over all of GitHub. If its lifecycle sticks, the user can no longer use the page. `reduce(state, event)` in `extension/src/state.js` holds every lifecycle rule as a pure function.

`scripts/check-lifecycle.mjs` explores every state that `reduce` can reach from `CLOSED`, for galleries of 1 to 8 items. It applies every event in every state: `openGallery` at each start index, `step` both ways, `jump` to every index and out of range, `close`, `settled` in and out, and `pageLeft`. The state space is finite, so the check covers event sequences of any length within that bound.

Properties, each with the harm it prevents:

1. **Index in range.** A step or jump never points past the gallery. Otherwise the lightbox renders nothing.
2. **Mount and unmount match.** `mount` only on closed to opening, `unmount` only on the way to closed. Otherwise the dialog or a hidden page image leaks.
3. **No item change mid-morph.** No `render` in `opening` or `closing`. Otherwise the close morph ends on the wrong page element.
4. **One morph per phase start.** A `morph` effect only on entry to `opening` or `closing`. Otherwise a second Escape restarts the animation.
5. **Nothing reopens while closing.**
6. **Always closable.** Every reachable state has a path to `closed`. Escape plus the finished morph closes from every open state.
7. **Bounded state space.** At most `1 + 3 × count` states. More means the index escaped its range.

## Run it

```sh
npm run -s verify:lifecycle
```

It takes under a second. A pass prints `PASS: 116 states and 2224 transitions for galleries of 1 to 8 items.` A failure prints `FAIL` and up to 20 violations, each as `count N, <phase>:<index> + <event>: <property>`. Read that as: with N items, in that phase at that index, that event broke that property.

## Real bug or model error

- The check calls the real `reduce`. There is no hand-written model of the reducer, so a violation is a real reducer behavior.
- It does not cover `lightbox.js`, which runs the effects. A violation can therefore be intended only if you also change how `lightbox.js` runs effects. In that case, change the property in the script in the same commit, and say why in the commit message.
- Never weaken a property to make a failing change pass. Fix `reduce` or report the finding.

## It can fail

These broken variants of `state.js` each fail the check. Each was run on commit `0275731`.

| Broken variant | Property that catches it |
| --- | --- |
| `closing` ignores `settled` out | 6 always closable |
| `pageLeft` returns no `unmount` | 2 mount and unmount match |
| `step` and `jump` skip `clampIndex` | 1 index in range, 7 bounded |
| `step` allowed while `closing` | 3 no item change mid-morph |
| `close` while `closing` morphs again | 4 one morph per phase start |

To repeat one: edit the line in `extension/src/state.js`, run the check, see `FAIL`, then run `git checkout extension/src/state.js`.

## Coverage record

- Files: `extension/src/state.js` (`reduce`, `clampIndex`, `CLOSED`), `extension/src/types.js` (`Gallery`).
- Not covered: `keyCommand` (unit tests cover it), the effect runner in `extension/src/lightbox.js`, the DOM, and real animation timing. The e2e tests and the `verify-gh-lightbox` skill cover those.
- Bound: galleries of 1 to 8 items. `reduce` treats every index the same, so a bug that needs more than 8 items is unlikely, but this check does not prove its absence.
- Sync commit: `0275731`. When `state.js` changes after this commit, read the diff, confirm the properties still describe it, run the check, then move this commit forward.
