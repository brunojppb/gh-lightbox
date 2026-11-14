// @ts-check
// Playwright with the unpacked extension on copies of GitHub pages. No GitHub session needed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const EXTENSION = `${ROOT}extension`;
const FIXTURES = `${ROOT}test/e2e/fixtures`;
const PULL = 'https://github.com/acme/widgets/pull/7';
const ISSUE = 'https://github.com/acme/widgets/issues/1';

/** Fixture file for each media URL. A UUID in the path picks the file, as it does on GitHub. */
const MEDIA = new Map([
  ['00000000-0000-4000-8000-000000000001', 'shot-1.png'],
  ['00000000-0000-4000-8000-000000000002', 'shot-2.png'],
  ['00000000-0000-4000-8000-000000000003', 'shot-3.png'],
  ['00000000-0000-4000-8000-000000000004', 'shot-4.png'],
  ['00000000-0000-4000-8000-000000000005', 'shot-5.png'],
  ['00000000-0000-4000-8000-0000000000a1', 'avatar.png'],
  ['00000000-0000-4000-8000-000000000010', 'demo.webm'],
]);

/**
 * @typedef {object} App
 * @property {import('@playwright/test').Page} page
 * @property {import('@playwright/test').BrowserContext} context
 * @property {import('@playwright/test').Locator} host  The lightbox host. Its data-phase is the lifecycle phase.
 */

/** @typedef {import('@playwright/test').Locator} Locator */

/** @type {import('@playwright/test').TestType<import('@playwright/test').PlaywrightTestArgs & import('@playwright/test').PlaywrightTestOptions & { app: App }, import('@playwright/test').PlaywrightWorkerArgs & import('@playwright/test').PlaywrightWorkerOptions>} */
const test = base.extend({
  // Playwright's own `context` and `page` stay unused: only a persistent context can load an extension.
  app: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await routeFixtures(context);
    const page = await context.newPage();
    /** @type {App} */
    const app = { page, context, host: page.locator('gh-lightbox') };
    await use(app);
    await context.close();
  },
});

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<void>}
 */
async function routeFixtures(context) {
  // The first route has the lowest priority. It keeps every other web request off the network.
  // It must skip chrome-extension: URLs, or the content script cannot load its modules.
  await context.route(/^https?:\/\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title><p>stub</p>' }),
  );
  await context.route(`${PULL}`, (route) => route.fulfill({ contentType: 'text/html', path: `${FIXTURES}/pull.html` }));
  await context.route(`${ISSUE}`, (route) => route.fulfill({ contentType: 'text/html', path: `${FIXTURES}/issue.html` }));
  const media = (/** @type {import('@playwright/test').Route} */ route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname.includes('/emoji/')) return route.fulfill({ path: `${FIXTURES}/emoji.png` });
    const file = [...MEDIA].find(([uuid]) => pathname.includes(uuid))?.[1] ?? 'shot-6.png';
    if (!file.endsWith('.webm')) return route.fulfill({ path: `${FIXTURES}/${file}` });
    return fulfillRange(route, readFileSync(`${FIXTURES}/${file}`));
  };
  await context.route('https://private-user-images.githubusercontent.com/**', media);
  await context.route('https://camo.githubusercontent.com/**', media);
  await context.route('https://github.com/user-attachments/**', media);
}

/**
 * Answers a media request with byte ranges, as GitHub's media host does. Chrome cannot seek without them.
 * @param {import('@playwright/test').Route} route
 * @param {Buffer} body
 * @returns {Promise<void>}
 */
function fulfillRange(route, body) {
  const headers = { 'content-type': 'video/webm', 'accept-ranges': 'bytes' };
  const range = route.request().headers()['range']?.match(/^bytes=(\d+)-(\d*)$/);
  if (!range) return route.fulfill({ headers, body });
  const start = Number(range[1]);
  const end = range[2] ? Number(range[2]) : body.length - 1;
  return route.fulfill({
    status: 206,
    headers: { ...headers, 'content-range': `bytes ${start}-${end}/${body.length}` },
    body: body.subarray(start, end + 1),
  });
}

/**
 * Opens a fixture page and waits until the extension has started and the images have loaded.
 * @param {App} app
 * @param {string} url
 * @returns {Promise<void>}
 */
async function visit({ page }, url) {
  await page.goto(url);
  await expect(page.locator('gh-lightbox[data-phase]')).toBeAttached();
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
}

/**
 * @param {App} app
 * @param {string} phase
 * @returns {Promise<void>}
 */
async function expectPhase({ host }, phase) {
  await expect(host).toHaveAttribute('data-phase', phase);
}

/**
 * Reads a video's state from the page.
 * @param {Locator} video
 * @returns {Promise<{ paused: boolean, time: number }>}
 */
function videoState(video) {
  return video.evaluate((el) => {
    const v = /** @type {HTMLVideoElement} */ (el);
    return { paused: v.paused, time: v.currentTime };
  });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} id
 * @returns {Promise<string>}
 */
function opacityOf(page, id) {
  return page.evaluate((id) => getComputedStyle(/** @type {Element} */ (document.getElementById(id))).opacity, id);
}

test.describe('on a pull request page', () => {
  test('a click opens the lightbox on that image, with counter and caption, and no new tab', async ({ app }) => {
    const { page, context } = app;
    await visit(app, PULL);
    const tabs = context.pages().length;
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('1 / 4');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('Login error');
    await expect(page.locator('gh-lightbox img.media')).toHaveAttribute('src', /-000000000001\.png/);
    await page.waitForTimeout(300);
    expect(context.pages()).toHaveLength(tabs);
    expect(page.url()).toBe(PULL);
  });

  test('the gallery holds the comment media only, and the click picks the start item', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i2').click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('2 / 4');
    await expect(page.locator('gh-lightbox .strip button')).toHaveCount(4);
    // The alt text "Image" and the upload URL say nothing, so the caption stays empty.
    await expect(page.locator('gh-lightbox .caption')).toBeHidden();
  });

  test('the open morph starts at the page image rect', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    const target = await page.locator('#i1').boundingBox();
    await page.locator('#i1').click();
    await expectPhase(app, 'opening');
    const start = await page.evaluate(() => {
      const frame = /** @type {HTMLElement} */ (document.querySelector('gh-lightbox')?.shadowRoot?.querySelector('.frame'));
      const [animation] = frame.getAnimations();
      if (!animation) return null;
      animation.pause();
      animation.currentTime = 0;
      const { x, y, width, height } = frame.getBoundingClientRect();
      return { x, y, width, height };
    });
    expect(start).not.toBeNull();
    expect(start?.x).toBeCloseTo(target?.x ?? NaN, 0);
    expect(start?.y).toBeCloseTo(target?.y ?? NaN, 0);
    expect(start?.width).toBeCloseTo(target?.width ?? NaN, 0);
    expect(start?.height).toBeCloseTo(target?.height ?? NaN, 0);
  });

  test('arrows and buttons move through the comment media, and stop at the ends', async ({ app }) => {
    const { page } = app;
    const counter = page.locator('gh-lightbox .counter');
    const prev = page.locator('gh-lightbox .prev');
    const next = page.locator('gh-lightbox .next');
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await expect(prev).toBeDisabled();

    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('1 / 4');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 4');
    await next.click();
    await expect(counter).toHaveText('3 / 4');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('4 / 4');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('Hidden shot');
    await expect(next).toBeDisabled();

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('4 / 4');
    await prev.click();
    await expect(counter).toHaveText('3 / 4');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('1 / 4');
    await expect(prev).toBeDisabled();
    await expectPhase(app, 'open');
  });

  test('a thumbnail jumps to its item', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.locator('gh-lightbox .strip button').nth(2).click();
    await expect(page.locator('gh-lightbox .counter')).toHaveText('3 / 4');
    await expect(page.locator('gh-lightbox img.media')).toHaveAttribute('src', /-000000000003$/);
    await expect(page.locator('gh-lightbox .strip button').nth(2)).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('gh-lightbox .strip button').nth(0)).toHaveAttribute('aria-current', 'false');
  });

  test('Escape closes, and the page image shows again', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    expect(await opacityOf(page, 'i1')).toBe('0');
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    await expect(page.locator('gh-lightbox dialog')).toBeHidden();
    expect(await opacityOf(page, 'i1')).toBe('1');
  });

  test('an image that GitHub detaches while open and puts back later is visible after close', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.evaluate(() => {
      const image = /** @type {HTMLElement} */ (document.getElementById('i1'));
      const holder = /** @type {HTMLElement} */ (image.parentElement);
      Object.assign(window, { detached: { image, holder } });
      image.remove();
    });
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    await page.evaluate(() => {
      const { image, holder } = /** @type {any} */ (window).detached;
      holder.append(image);
    });
    expect(await opacityOf(page, 'i1')).toBe('1');
  });

  test('the X button and the backdrop close it', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.locator('gh-lightbox .close').click();
    await expectPhase(app, 'closed');
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.mouse.click(5, 300);
    await expectPhase(app, 'closed');
  });

  test('Escape during the open morph closes and shows the page image', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    const phases = await page.evaluate(() => {
      const host = /** @type {HTMLElement} */ (document.querySelector('gh-lightbox'));
      /** @type {string[]} */
      const seen = [];
      document.getElementById('i1')?.click();
      seen.push(host.dataset.phase ?? '');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      seen.push(host.dataset.phase ?? '');
      return seen;
    });
    expect(phases).toEqual(['opening', 'closing']);
    await expectPhase(app, 'closed');
    await expect(page.locator('gh-lightbox dialog')).toBeHidden();
    expect(await opacityOf(page, 'i1')).toBe('1');
  });

  test('a double click opens the lightbox and leaves it open', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').dblclick();
    await expectPhase(app, 'open');
    await page.waitForTimeout(600);
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('1 / 4');
  });

  test('Cmd-click keeps the new tab and opens no lightbox', async ({ app }) => {
    const { page, context } = app;
    await visit(app, PULL);
    const popup = context.waitForEvent('page');
    await page.locator('#i1').click({ modifiers: ['Meta'] });
    await popup;
    await expectPhase(app, 'closed');
  });

  test('an emoji click opens no lightbox', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('img.emoji').click();
    await page.locator('g-emoji').click();
    await expectPhase(app, 'closed');
  });

  test('an avatar click follows its link', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await Promise.all([page.waitForURL('https://github.com/octocat'), page.locator('img.avatar').click()]);
  });

  test('an image linked to another site follows the link', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    const popup = app.context.waitForEvent('page');
    await page.locator('#i-external').click();
    expect((await popup).url()).toBe('https://example.com/docs');
    await expectPhase(app, 'closed');
  });

  test('GitHub shortcuts do not fire while the lightbox is open', async ({ app }) => {
    const { page } = app;
    const presses = () => page.evaluate(() => /** @type {any} */ (window).__j);
    await visit(app, PULL);
    await page.keyboard.press('j');
    expect(await presses()).toBe(1);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.keyboard.press('j');
    expect(await presses()).toBe(1);
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    await page.keyboard.press('j');
    expect(await presses()).toBe(2);
  });

  test('a pushState to another path closes the lightbox at once', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.evaluate(() => history.pushState({}, '', '?tab=files'));
    await page.waitForTimeout(200);
    await expectPhase(app, 'open');
    await page.evaluate(() => history.pushState({}, '', '/acme/widgets/pull/7/files'));
    await expectPhase(app, 'closed');
    await expect(page.locator('gh-lightbox dialog')).toBeHidden();
    expect(await opacityOf(page, 'i1')).toBe('1');
  });

  test('reduced motion opens with a fade and no transform', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#i1').click();
    const animation = await page.evaluate(() => {
      const frame = /** @type {HTMLElement} */ (document.querySelector('gh-lightbox')?.shadowRoot?.querySelector('.frame'));
      const [first] = frame.getAnimations();
      const effect = /** @type {KeyframeEffect} */ (first?.effect);
      return {
        duration: effect.getTiming().duration,
        transforms: effect.getKeyframes().filter((k) => k['transform'] !== undefined && k['transform'] !== 'none').length,
        opacity: effect.getKeyframes().map((k) => k['opacity']),
      };
    });
    expect(animation).toEqual({ duration: 120, transforms: 0, opacity: ['0', '1'] });
    await expectPhase(app, 'open');
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
  });

  test('after a Turbo-style body swap, a click still opens the lightbox', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.evaluate(() => document.body.replaceWith(/** @type {HTMLElement} */ (document.body.cloneNode(true))));
    await page.waitForFunction(() => [...document.images].every((image) => image.complete));
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('1 / 4');
  });

  test('a video plays inline, and the launcher opens it at the page time', async ({ app }) => {
    const { page } = app;
    const pageVideo = page.locator('#v1');
    const stage = page.locator('gh-lightbox video.media');
    await visit(app, PULL);
    await pageVideo.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => /** @type {HTMLVideoElement} */ (document.getElementById('v1')).readyState >= 3);

    await pageVideo.click();
    await expectPhase(app, 'closed');
    await expect.poll(async () => (await videoState(pageVideo)).paused).toBe(false);
    await pageVideo.evaluate((el) => {
      const video = /** @type {HTMLVideoElement} */ (el);
      video.pause();
      video.currentTime = 2;
    });

    await pageVideo.hover({ position: { x: 100, y: 100 } });
    const launcher = page.locator('gh-lightbox .launcher');
    await expect(launcher).toBeVisible();
    await launcher.click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('1 / 2');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('demo-light.mp4');
    await expect(stage).toBeVisible();
    await expect.poll(async () => (await videoState(stage)).time).toBeGreaterThan(2.2);
    expect((await videoState(pageVideo)).paused).toBe(true);

    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    expect((await videoState(pageVideo)).time).toBeGreaterThan(2.2);
    expect(await opacityOf(page, 'v1')).toBe('1');
  });

  test('Space in the lightbox toggles the focused video', async ({ app }) => {
    const { page } = app;
    const stage = page.locator('gh-lightbox video.media');
    await visit(app, PULL);
    await page.locator('#v1').scrollIntoViewIfNeeded();
    await page.locator('#v1').hover({ position: { x: 100, y: 100 } });
    await page.locator('gh-lightbox .launcher').click();
    await expectPhase(app, 'open');
    await expect.poll(async () => (await videoState(stage)).paused).toBe(false);
    await stage.focus();
    await page.keyboard.press('Space');
    await expect.poll(async () => (await videoState(stage)).paused).toBe(true);
    await page.keyboard.press('Space');
    await expect.poll(async () => (await videoState(stage)).paused).toBe(false);
    await expectPhase(app, 'open');
  });

  test('page-scroll keys leave the page where it is, and the close shrinks back', async ({ app }) => {
    const { page } = app;
    const scrollY = () => page.evaluate(() => window.scrollY);
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    const before = await scrollY();
    for (const key of ['ArrowDown', 'ArrowUp', 'Space', 'PageDown', 'PageUp', 'End', 'Home']) {
      await page.keyboard.press(key);
      // Keyboard scrolling is smooth, so the offset moves a few frames later.
      await page.waitForTimeout(250);
      expect(await scrollY(), key).toBe(before);
    }
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    expect(await scrollY()).toBe(before);
  });

  test('Enter and Space on the Next button still step', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.locator('gh-lightbox .next').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('2 / 4');
    await page.keyboard.press('Space');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('3 / 4');
  });

  test('focus stays in the lightbox when the focused Next button becomes disabled', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.locator('gh-lightbox .next').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('4 / 4');
    await expect(page.locator('gh-lightbox .next')).toBeDisabled();
    expect(await page.evaluate(() => document.activeElement?.localName)).toBe('gh-lightbox');
    const before = await page.evaluate(() => window.scrollY);
    await page.keyboard.press('Space');
    await page.waitForTimeout(250);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
  });

  test('after a launcher open and Escape, focus is on the page video', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#v1').scrollIntoViewIfNeeded();
    await page.locator('#v1').hover({ position: { x: 100, y: 100 } });
    await page.locator('gh-lightbox .launcher').click();
    await expectPhase(app, 'open');
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    expect(await page.evaluate(() => document.activeElement?.id)).toBe('v1');
  });

  test('stepping from a video to an image stops the video and shows the image', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#v1').scrollIntoViewIfNeeded();
    await page.locator('#v1').hover({ position: { x: 100, y: 100 } });
    await page.locator('gh-lightbox .launcher').click();
    await expectPhase(app, 'open');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('2 / 2');
    await expect(page.locator('gh-lightbox img.media')).toBeVisible();
    await expect(page.locator('gh-lightbox video.media')).toBeHidden();
    await expect(page.locator('gh-lightbox video.media')).not.toHaveAttribute('src', /.+/);
  });
});

test.describe('on an issue page', () => {
  test('nested markdown bodies count each image once, and a comment is its own gallery', async ({ app }) => {
    const { page } = app;
    await visit(app, ISSUE);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('1 / 2');
    await expect(page.locator('gh-lightbox .strip button')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    await page.locator('#i3').scrollIntoViewIfNeeded();
    await page.locator('#i3').click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('Another');
    // A single item has no counter and no strip.
    await expect(page.locator('gh-lightbox .counter')).toBeHidden();
    await expect(page.locator('gh-lightbox .strip')).toBeHidden();
  });
});
