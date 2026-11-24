// Drives the unpacked extension on the public test issue and pull request on github.com.
// Saves screenshots, a video for each page, and a report to .verify/<run>/.
import { mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// The build output. Each package script that loads the extension runs `vp build` first.
const EXTENSION = `${ROOT}dist/extension`;
const RUN = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = `${ROOT}.verify/${RUN}`;
const PAGES = [
  { name: 'issue', url: 'https://github.com/brunojppb/gh-lightbox/issues/1' },
  { name: 'pull', url: 'https://github.com/brunojppb/gh-lightbox/pull/2' },
];
const VIEWPORT = { width: 1440, height: 900 };

const results: { page: string; check: string; ok: boolean; detail: string }[] = [];
/** Recorded video path for each page name. */
const videos: [string, string][] = [];
function record(page: string, check: string, ok: boolean, detail: string = '') {
  results.push({ page, check, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${page}  ${check}${detail ? `  (${detail})` : ''}`);
}
async function waitPhase(page: import('@playwright/test').Page, phase: string) {
  await page.locator(`gh-lightbox[data-phase="${phase}"]`).waitFor({ state: 'attached', timeout: 5000 });
}
async function snap(page: import('@playwright/test').Page, name: string, shot: string) {
  await page.screenshot({ path: `${OUT}/${name}-${shot}.png` });
}
async function drive(context: import('@playwright/test').BrowserContext, target: { name: string; url: string }) {
  const { name, url } = target;
  const page = await context.newPage();
  const tabs = () => context.pages().length;
  await page.goto(url, { waitUntil: 'load' });
  await page.locator('gh-lightbox').waitFor({ state: 'attached', timeout: 10000 });
  record(name, 'extension host mounted on github.com', true);

  const bars = page.locator('.markdown-body img[alt="Bars"]').first();
  await bars.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await snap(page, name, '01-page');
  const before = tabs();
  await bars.click();
  await page.waitForTimeout(120);
  await snap(page, name, '02-opening');
  await waitPhase(page, 'open');
  await page.waitForTimeout(300);
  await snap(page, name, '03-open');
  const shadow = page.locator('gh-lightbox');
  const counter = await shadow.locator('.counter').textContent();
  const caption = await shadow.locator('.caption').textContent();
  record(name, 'image click opens the lightbox, no new tab', tabs() === before, `tabs ${before} -> ${tabs()}`);
  record(
    name,
    'counter and caption',
    /^\d+ \/ \d+$/.test(counter ?? '') && caption === 'Bars',
    `"${counter}" "${caption}"`,
  );

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const caption2 = await shadow.locator('.caption').textContent();
  record(name, 'ArrowRight moves to the next item', caption2 === 'Test source', `"${caption2}"`);
  await snap(page, name, '04-next');

  const thumbs = shadow.locator('.strip button');
  const count = await thumbs.count();
  await thumbs.nth(count - 1).click();
  await page.waitForTimeout(500);
  const last = await shadow.locator('.counter').textContent();
  record(name, 'thumbnail jumps to the last item', last === `${count} / ${count}`, `"${last}", ${count} thumbs`);
  const nextHidden = await shadow.locator('.next').isHidden();
  record(name, 'next button hidden at the end', nextHidden);
  await snap(page, name, '05-last');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(80);
  await snap(page, name, '06-closing');
  await waitPhase(page, 'closed');
  const visible = await bars.evaluate((el) => getComputedStyle(el).opacity !== '0' && el.getAnimations().length === 0);
  record(name, 'Escape closes, page image visible again', visible);

  const video = page.locator('.markdown-body details video').first();
  await video.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await video.hover();
  const launcher = shadow.locator('.launcher');
  await launcher.waitFor({ state: 'visible', timeout: 3000 });
  await snap(page, name, '07-launcher');
  record(name, 'hover on video shows the expand button', true);
  await launcher.click();
  await waitPhase(page, 'open');
  await page.waitForTimeout(1500);
  const stage = await shadow.locator('video.media').evaluate((v) => {
    const el = v as HTMLVideoElement;
    return { time: el.currentTime, paused: el.paused, ready: el.readyState, error: el.error?.code ?? 0 };
  });
  record(
    name,
    'video plays in the lightbox',
    stage.ready >= 2 && stage.error === 0 && stage.time > 0,
    JSON.stringify(stage),
  );
  await snap(page, name, '08-video');
  await page.keyboard.press('Escape');
  await waitPhase(page, 'closed');

  const comment = page.locator('.markdown-body img[alt="Comment image"]').first();
  await comment.scrollIntoViewIfNeeded();
  await comment.click();
  await waitPhase(page, 'open');
  await page.waitForTimeout(300);
  const commentCounter = await shadow.locator('.counter').isHidden();
  const commentStrip = await shadow.locator('.strip').isHidden();
  record(name, 'a comment is its own one-item gallery', commentCounter && commentStrip);
  await snap(page, name, '09-comment');
  await page.keyboard.press('Escape');
  await waitPhase(page, 'closed');

  const recording = await page.video()?.path();
  if (recording) videos.push([name, recording]);
  await page.close();
}

mkdirSync(OUT, { recursive: true });
const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  viewport: VIEWPORT,
  recordVideo: { dir: OUT, size: VIEWPORT },
  args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
});
let crashed = '';
try {
  for (const target of PAGES) await drive(context, target);
} catch (error) {
  crashed = String(error);
  console.error(error);
} finally {
  await context.close();
}
// Playwright names each video by a random id. Name the page videos and drop the blank start tab.
for (const [name, path] of videos) renameSync(path, `${OUT}/${name}.webm`);
for (const file of readdirSync(OUT)) if (/^[0-9a-f]{32}\.webm$/.test(file)) rmSync(`${OUT}/${file}`);
writeFileSync(`${OUT}/report.json`, JSON.stringify({ run: RUN, results, crashed }, null, 2));
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} pass, ${failed} fail${crashed ? ', crashed' : ''}. Evidence: ${OUT}`);
process.exit(failed || crashed ? 1 : 0);
