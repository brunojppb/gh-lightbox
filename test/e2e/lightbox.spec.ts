// Playwright with the unpacked extension on copies of GitHub pages. No GitHub session needed.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test as base, expect, chromium } from '@playwright/test';
import type { BrowserContext, Locator, Page, Route } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
// The build output. Each package script that loads the extension runs `vp build` first.
const EXTENSION = `${ROOT}dist/extension`;
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
  ['00000000-0000-4000-8000-000000000021', 'size-small.png'],
  ['00000000-0000-4000-8000-000000000022', 'size-wide.png'],
  ['00000000-0000-4000-8000-000000000023', 'size-tall.png'],
  ['00000000-0000-4000-8000-000000000024', 'size-large.png'],
  ['00000000-0000-4000-8000-0000000000a1', 'avatar.png'],
  ['00000000-0000-4000-8000-000000000010', 'demo.webm'],
]);

interface App {
  page: Page;
  context: BrowserContext;
  /** The lightbox host. Its data-phase is the lifecycle phase. */
  host: Locator;
}

const test = base.extend<{ app: App }>({
  // Playwright's own `context` and `page` stay unused: only a persistent context can load an extension.
  // Playwright reads the fixtures a test uses from this pattern, so it must stay an object pattern.
  // oxlint-disable-next-line no-empty-pattern
  app: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    await routeFixtures(context);
    const page = await context.newPage();
    const app: App = { page, context, host: page.locator('gh-lightbox') };
    await use(app);
    await context.close();
  },
});
async function routeFixtures(context: BrowserContext): Promise<void> {
  // The first route has the lowest priority. It keeps every other web request off the network.
  // It must skip chrome-extension: URLs, or the content script cannot load its modules.
  await context.route(/^https?:\/\//, (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>stub</title><p>stub</p>' }),
  );
  await context.route(`${PULL}`, (route) => route.fulfill({ contentType: 'text/html', path: `${FIXTURES}/pull.html` }));
  await context.route(`${ISSUE}`, (route) =>
    route.fulfill({ contentType: 'text/html', path: `${FIXTURES}/issue.html` }),
  );
  const media = (route: Route) => {
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
 */
function fulfillRange(route: import('@playwright/test').Route, body: Buffer): Promise<void> {
  const headers = { 'content-type': 'video/webm', 'accept-ranges': 'bytes' };
  const range = route
    .request()
    .headers()
    ['range']?.match(/^bytes=(\d+)-(\d*)$/);
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
 */
async function visit({ page }: App, url: string): Promise<void> {
  await page.goto(url);
  await expect(page.locator('gh-lightbox[data-phase]')).toBeAttached();
  await page.waitForFunction(() => [...document.images].every((image) => image.complete));
}
async function expectPhase({ host }: App, phase: string): Promise<void> {
  await expect(host).toHaveAttribute('data-phase', phase);
}

/**
 * Reads a video's state from the page.
 */
function videoState(video: Locator): Promise<{ paused: boolean; time: number }> {
  return video.evaluate((el) => {
    const v = el as HTMLVideoElement;
    return { paused: v.paused, time: v.currentTime };
  });
}
function opacityOf(page: Page, id: string): Promise<string> {
  return page.evaluate((id) => getComputedStyle(document.getElementById(id) as Element).opacity, id);
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
      const frame = document.querySelector('gh-lightbox')?.shadowRoot?.querySelector('.frame') as HTMLElement;
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
    await expect(prev).toBeHidden();
    await expect(next).toBeVisible();

    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('1 / 4');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 4');
    await expect(prev).toBeVisible();
    await expect(next).toBeVisible();
    await next.click();
    await expect(counter).toHaveText('3 / 4');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('4 / 4');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('Hidden shot');
    await expect(next).toBeHidden();
    await expect(prev).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('4 / 4');
    await prev.click();
    await expect(counter).toHaveText('3 / 4');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('1 / 4');
    await expect(prev).toBeHidden();
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
      const image = document.getElementById('i1') as HTMLElement;
      const holder = image.parentElement as HTMLElement;
      Object.assign(window, { detached: { image, holder } });
      image.remove();
    });
    await page.keyboard.press('Escape');
    await expectPhase(app, 'closed');
    await page.evaluate(() => {
      const { image, holder } = (window as any).detached;
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
      const host = document.querySelector('gh-lightbox') as HTMLElement;
      const seen: string[] = [];
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

  test('a thumbnail that links to another upload follows the link', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i-thumb').scrollIntoViewIfNeeded();
    const popup = app.context.waitForEvent('page');
    await page.locator('#i-thumb').click();
    expect((await popup).url()).toBe('https://github.com/user-attachments/assets/00000000-0000-4000-8000-0000000000b2');
    await expectPhase(app, 'closed');
  });

  test('the gallery skips an image that is hidden by CSS', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i-light').scrollIntoViewIfNeeded();
    await page.locator('#i-light').click();
    await expectPhase(app, 'open');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('1 / 2');
    await expect(page.locator('gh-lightbox .strip button')).toHaveCount(2);
  });

  test('GitHub shortcuts do not fire while the lightbox is open', async ({ app }) => {
    const { page } = app;
    const presses = () => page.evaluate(() => (window as any).__j);
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
      const frame = document.querySelector('gh-lightbox')?.shadowRoot?.querySelector('.frame') as HTMLElement;
      const [first] = frame.getAnimations();
      const effect = first?.effect as KeyframeEffect;
      return {
        duration: effect.getTiming().duration,
        transforms: effect.getKeyframes().filter((k) => k['transform'] !== undefined && k['transform'] !== 'none')
          .length,
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
    await page.evaluate(() => document.body.replaceWith(document.body.cloneNode(true) as HTMLElement));
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
    await page.waitForFunction(() => (document.getElementById('v1') as HTMLVideoElement).readyState >= 3);

    await pageVideo.click();
    await expectPhase(app, 'closed');
    await expect.poll(async () => (await videoState(pageVideo)).paused).toBe(false);
    await pageVideo.evaluate((el) => {
      const video = el as HTMLVideoElement;
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

  test('the expand button follows the video when the page scrolls under the pointer', async ({ app }) => {
    const { page } = app;
    const launcher = page.locator('gh-lightbox .launcher');
    await visit(app, PULL);
    await page.locator('#v1').scrollIntoViewIfNeeded();
    await page.locator('#v1').hover({ position: { x: 100, y: 100 } });
    await expect(launcher).toBeVisible();
    const top = (await launcher.boundingBox())?.y ?? NaN;
    await page.mouse.wheel(0, 60);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.waitForTimeout(300);
    await expect(launcher).toBeVisible();
    const [button, video] = await Promise.all([launcher.boundingBox(), page.locator('#v1').boundingBox()]);
    expect(button?.y).not.toBe(top);
    expect(button?.y).toBeCloseTo((video?.y ?? NaN) + 8, 0);
    expect((button?.x ?? NaN) + (button?.width ?? NaN)).toBeCloseTo((video?.x ?? NaN) + (video?.width ?? NaN) - 8, 0);
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

  test('a hidden arrow cannot take focus', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    const prev = page.locator('gh-lightbox .prev');
    await expect(prev).toBeHidden();
    expect(
      await prev.evaluate((button) => (button.focus(), button.getRootNode() as ShadowRoot).activeElement === button),
    ).toBe(false);
  });

  test('focus stays in the lightbox when the focused Next button hides', async ({ app }) => {
    const { page } = app;
    await visit(app, PULL);
    await page.locator('#i1').click();
    await expectPhase(app, 'open');
    await page.locator('gh-lightbox .next').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Enter');
    await expect(page.locator('gh-lightbox .counter')).toHaveText('4 / 4');
    await expect(page.locator('gh-lightbox .next')).toBeHidden();
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
    // A single item has no arrows, and the X stays in its place at the top right.
    await expect(page.locator('gh-lightbox .prev')).toBeHidden();
    await expect(page.locator('gh-lightbox .next')).toBeHidden();
    const close = await page.locator('gh-lightbox .close').boundingBox();
    const width = page.viewportSize()?.width ?? NaN;
    expect((close?.x ?? NaN) + (close?.width ?? NaN)).toBeCloseTo(width - 16, 0);
  });

  test('in a short viewport, a click on the centre of each arrow steps, over the caption and strip', async ({
    app,
  }) => {
    const { page } = app;
    await page.setViewportSize({ width: 390, height: 200 });
    await visit(app, ISSUE);
    await page.locator('#s1').scrollIntoViewIfNeeded();
    await page.locator('#s1').click();
    await expectPhase(app, 'open');
    const counter = page.locator('gh-lightbox .counter');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('Small');
    // A real click at the centre, so whatever paints on top there gets it.
    const clickCentre = async (selector: string) => {
      const box = await page.locator(selector).boundingBox();
      await page.mouse.click((box?.x ?? NaN) + (box?.width ?? NaN) / 2, (box?.y ?? NaN) + (box?.height ?? NaN) / 2);
    };
    await clickCentre('gh-lightbox .next');
    await expect(counter).toHaveText('2 / 4');
    await clickCentre('gh-lightbox .next');
    await expect(counter).toHaveText('3 / 4');
    await expect(page.locator('gh-lightbox .caption')).toHaveText('Tall');
    await clickCentre('gh-lightbox .prev');
    await expect(counter).toHaveText('2 / 4');
  });

  test('mid-slide, the frame does not cover either arrow', async ({ app }) => {
    const { page } = app;
    await page.setViewportSize({ width: 390, height: 844 });
    await visit(app, ISSUE);
    await page.locator('#s1').scrollIntoViewIfNeeded();
    await page.locator('#s1').click();
    await expectPhase(app, 'open');
    const counter = page.locator('gh-lightbox .counter');
    // Pauses the slide at its start, where the frame sits 40px off its place, and names the element at the arrow centre.
    const hitAtArrowMidSlide = (selector: string) =>
      page.evaluate((selector) => {
        const root = document.querySelector('gh-lightbox')?.shadowRoot as ShadowRoot;
        const [animation] = (root.querySelector('.frame') as HTMLElement).getAnimations();
        if (!animation) return 'no slide';
        animation.pause();
        animation.currentTime = 0;
        const { x, y, width, height } = (root.querySelector(selector) as HTMLElement).getBoundingClientRect();
        const hit = root.elementFromPoint(x + width / 2, y + height / 2);
        animation.finish();
        return hit?.className ?? 'nothing';
      }, selector);
    // Small to Wide slides in from the right, over Next.
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('2 / 4');
    expect(await hitAtArrowMidSlide('.next')).toBe('next');
    await page.keyboard.press('ArrowRight');
    await expect(counter).toHaveText('3 / 4');
    // Tall to Wide slides in from the left, over Previous.
    await page.keyboard.press('ArrowLeft');
    await expect(counter).toHaveText('2 / 4');
    expect(await hitAtArrowMidSlide('.prev')).toBe('prev');
  });

  for (const viewport of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 },
  ]) {
    test(`the controls stay in one place for images of very different sizes at ${viewport.width}x${viewport.height}`, async ({
      app,
    }) => {
      const { page } = app;
      await page.setViewportSize(viewport);
      await visit(app, ISSUE);
      await page.locator('#s1').scrollIntoViewIfNeeded();
      await page.locator('#s1').click();
      await expectPhase(app, 'open');
      const counter = page.locator('gh-lightbox .counter');
      const boxes = { close: [] as unknown[], prev: [] as unknown[], next: [] as unknown[] };
      for (let i = 1; i <= 4; i++) {
        await expect(counter).toHaveText(`${i} / 4`);
        await expect(page.locator('gh-lightbox img.media')).toHaveAttribute(
          'src',
          new RegExp(`-0000000000${20 + i}\\.png`),
        );
        // The frame may still slide; the controls must not depend on it.
        await page.waitForTimeout(400);
        boxes.close.push(await page.locator('gh-lightbox .close').boundingBox());
        if (i > 1) boxes.prev.push(await page.locator('gh-lightbox .prev').boundingBox());
        if (i < 4) boxes.next.push(await page.locator('gh-lightbox .next').boundingBox());
        if (i < 4) await page.keyboard.press('ArrowRight');
      }
      for (const list of Object.values(boxes)) {
        expect(list[0]).not.toBeNull();
        for (const box of list) expect(box).toEqual(list[0]);
      }
    });
  }
});

/** Returns the ID that Chrome gives an unpacked extension: a SHA-256 of its folder path, as letters a to p. */
function unpackedExtensionId(path: string): string {
  const hex = createHash('sha256').update(realpathSync(path)).digest('hex').slice(0, 32);
  return hex.replace(/[0-9a-f]/g, (digit) => String.fromCharCode(97 + parseInt(digit, 16)));
}

test.describe('extension files', () => {
  test('a page on github.com cannot load any extension file, so it cannot detect the extension', async ({ app }) => {
    const base = `chrome-extension://${unpackedExtensionId(EXTENSION)}`;
    // The browser itself can open the manifest. That proves the ID is right.
    const control = await app.context.newPage();
    await control.goto(`${base}/manifest.json`);
    expect(JSON.parse(await control.locator('body').innerText())).toMatchObject({ name: 'Lightbox for GitHub' });
    await control.close();

    await visit(app, ISSUE);
    for (const file of ['manifest.json', 'content.js', 'icons/icon-128.png']) {
      const loaded = await app.page.evaluate(
        (url) =>
          fetch(url).then(
            () => true,
            () => false,
          ),
        `${base}/${file}`,
      );
      expect(loaded, file).toBe(false);
    }
  });
});
