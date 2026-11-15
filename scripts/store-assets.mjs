// @ts-check
// Builds the Chrome Web Store images: the promo tile and README banner from SVG,
// and screenshots of the unpacked extension on the showcase comment of the demo pull request.
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION = `${ROOT}extension`;
const SHOTS = `${ROOT}store/screenshots`;
// The store takes 1280x800 screenshots and a 440x280 small promo tile.
const SCREEN = { width: 1280, height: 800 };
const SVGS = [
  { from: 'store/promo-tile.svg', to: 'store/promo-tile.png', size: { width: 440, height: 280 } },
  { from: 'docs/assets/banner.svg', to: 'docs/assets/banner.png', size: { width: 1280, height: 640 } },
];
// The demo pull request has a showcase comment with CC0 photos and video, and it credits each author.
// The URL has no #issuecomment anchor, because GitHub draws a focus outline on the anchored comment.
const SHOWCASE = 'https://github.com/brunojppb/gh-lightbox/pull/2';
const FIRST_PHOTO = 'img[alt="Northern lights over Lofoten"]';

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} phase
 * @returns {Promise<void>}
 */
async function waitPhase(page, phase) {
  await page.locator(`gh-lightbox[data-phase="${phase}"]`).waitFor({ state: 'attached', timeout: 5000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} url
 * @returns {Promise<void>}
 */
async function visit(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('gh-lightbox').waitFor({ state: 'attached', timeout: 10000 });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} name
 * @returns {Promise<void>}
 */
async function shot(page, name) {
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
  console.log(`wrote store/screenshots/${name}.png`);
}

/**
 * Captures the store screenshots with the extension loaded.
 * @param {import('@playwright/test').BrowserContext} context
 * @returns {Promise<void>}
 */
async function captureScreens(context) {
  const page = await context.newPage();
  const host = page.locator('gh-lightbox');

  await visit(page, SHOWCASE);
  // The lightbox makes one gallery from each comment, so the showcase gallery holds only its own media.
  const comment = page.locator('.markdown-body').filter({ has: page.locator(FIRST_PHOTO) }).last();
  const photo = comment.locator(FIRST_PHOTO);
  await photo.scrollIntoViewIfNeeded();
  await photo.click();
  await waitPhase(page, 'open');
  await page.waitForTimeout(500);
  await shot(page, '1-image');

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  await shot(page, '2-gallery');
  await page.keyboard.press('Escape');
  await waitPhase(page, 'closed');

  const video = comment.locator('video').first();
  await video.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.waitForTimeout(400);
  await video.hover();
  await host.locator('.launcher').waitFor({ state: 'visible', timeout: 3000 });
  await page.waitForTimeout(300);
  await shot(page, '3-expand-video');

  await host.locator('.launcher').click();
  await waitPhase(page, 'open');
  await page.waitForTimeout(1500);
  await shot(page, '4-video');
  await page.close();
}

mkdirSync(SHOTS, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: SCREEN,
  deviceScaleFactor: 1,
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});
try {
  for (const svg of SVGS) await renderSvg(context, svg);
  await captureScreens(context);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await context.close();
}

/**
 * Renders an SVG to a PNG of its exact size.
 * @param {import('@playwright/test').BrowserContext} ctx
 * @param {{ from: string, to: string, size: { width: number, height: number } }} svg
 * @returns {Promise<void>}
 */
async function renderSvg(ctx, { from, to, size }) {
  const page = await ctx.newPage();
  await page.setViewportSize(size);
  // A file: page lets the SVG load the icon it links by a relative path.
  await page.goto(pathToFileURL(`${ROOT}${from}`).href);
  await page.screenshot({ path: `${ROOT}${to}` });
  await page.close();
  console.log(`wrote ${to}`);
}
