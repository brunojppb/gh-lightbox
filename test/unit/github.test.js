// @ts-check
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReviewPage, captionFor, assetKey } from '../../extension/src/github.js';

test('isReviewPage accepts issues, pulls, and pull subpages only', () => {
  for (const path of ['/o/r/issues/1', '/o/r/pull/2', '/o/r/pull/2/files', '/o/r/pull/2/commits/abc']) {
    assert.equal(isReviewPage(path), true, path);
  }
  for (const path of ['/o/r', '/o/r/issues', '/o/r/pulls', '/o/r/blob/main/README.md', '/o/r/issues/new']) {
    assert.equal(isReviewPage(path), false, path);
  }
});

test('captionFor prefers real alt text, then the video label, then a file name', () => {
  const uuid = '6f1c2d3e-4a5b-4c6d-8e7f-0123456789ab';
  assert.equal(captionFor({ alt: ' Login error ', label: 'x.mp4', url: 'https://x.test/a.png' }), 'Login error');
  assert.equal(captionFor({ alt: 'Image', label: '', url: 'https://x.test/files/before.png' }), 'before.png');
  assert.equal(captionFor({ alt: '', label: ' jump-light.mp4 ', url: 'https://x.test/' }), 'jump-light.mp4');
  assert.equal(captionFor({ alt: 'image', label: '', url: `https://github.com/user-attachments/assets/${uuid}` }), '');
  assert.equal(captionFor({ alt: '', label: '', url: `https://private-user-images.githubusercontent.com/1/22-${uuid}.png?jwt=a.b` }), '');
  assert.equal(captionFor({ alt: '', label: '', url: 'https://x.test/a%20b.png' }), 'a b.png');
  assert.equal(captionFor({ alt: '', label: '', url: 'not a url' }), '');
});

test('assetKey names an upload by its UUID, so a new signed URL gives the same key', () => {
  const uuid = '6F1C2D3E-4a5b-4c6d-8e7f-0123456789ab';
  const first = `https://private-user-images.githubusercontent.com/1/22-${uuid}.png?jwt=one`;
  const second = `https://private-user-images.githubusercontent.com/1/22-${uuid}.png?jwt=two`;
  assert.equal(assetKey(first), assetKey(second));
  assert.equal(assetKey(first), uuid.toLowerCase());
  assert.equal(assetKey(`https://github.com/user-attachments/assets/${uuid}`), uuid.toLowerCase());
});

test('assetKey without a UUID drops the query and hash', () => {
  assert.equal(assetKey('https://camo.githubusercontent.com/abc/def?x=1#top'), 'https://camo.githubusercontent.com/abc/def');
  assert.notEqual(assetKey('https://x.test/a.png'), assetKey('https://x.test/b.png'));
});

// galleryFor needs a real DOM. The e2e fixtures cover it.
