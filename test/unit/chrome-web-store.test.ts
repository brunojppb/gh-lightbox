import { test } from 'vite-plus/test';
import assert from 'node:assert/strict';
import { StoreError, blockingReason, publishVersion } from '../../scripts/lib/chrome-web-store.ts';
import type { Deps } from '../../scripts/lib/chrome-web-store.ts';

const item = { publisherId: 'pub', itemId: 'abc', token: 't0ken' };
const zip = new Uint8Array([80, 75, 3, 4]);
const BASE = 'https://chromewebstore.googleapis.com';

interface Sent {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/** A fake fetch that answers each request with the next scripted reply, and records what was sent. */
function fakeStore(replies: { status?: number; body: unknown }[]) {
  const sent: Sent[] = [];
  const logs: string[] = [];
  const deps: Deps = {
    fetch: (async (url: string, init: RequestInit) => {
      sent.push({ method: String(init.method), url, headers: init.headers as Record<string, string>, body: init.body });
      const reply = replies.shift();
      if (!reply) throw new Error(`unexpected request ${url}`);
      const text = typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body);
      return new Response(text, { status: reply.status ?? 200 });
    }) as typeof fetch,
    sleep: async () => {},
    log: (message) => logs.push(message),
  };
  return { deps, sent, logs };
}

test('publishVersion checks the status, uploads the zip, and submits it for review', async () => {
  const { deps, sent } = fakeStore([
    { body: { publishedItemRevisionStatus: { state: 'PUBLISHED' } } },
    { body: { uploadState: 'SUCCEEDED', crxVersion: '0.3.0' } },
    { body: { state: 'PENDING_REVIEW' } },
  ]);
  const state = await publishVersion(deps, item, { zip, version: '0.3.0' });
  assert.equal(state, 'PENDING_REVIEW');
  assert.deepEqual(
    sent.map((s) => `${s.method} ${s.url}`),
    [
      `GET ${BASE}/v2/publishers/pub/items/abc:fetchStatus`,
      `POST ${BASE}/upload/v2/publishers/pub/items/abc:upload`,
      `POST ${BASE}/v2/publishers/pub/items/abc:publish`,
    ],
  );
  for (const s of sent) assert.equal(s.headers.Authorization, 'Bearer t0ken');
  assert.equal(sent[1]?.body, zip);
  assert.equal(sent[1]?.headers['Content-Type'], 'application/zip');
  assert.deepEqual(JSON.parse(String(sent[2]?.body)), { publishType: 'DEFAULT_PUBLISH' });
});

test('a version still in review stops the publish before any upload', async () => {
  const { deps, sent } = fakeStore([
    {
      body: {
        submittedItemRevisionStatus: { state: 'PENDING_REVIEW', distributionChannels: [{ crxVersion: '0.2.0' }] },
      },
    },
  ]);
  await assert.rejects(publishVersion(deps, item, { zip, version: '0.3.0' }), (error: Error) => {
    assert.ok(error instanceof StoreError);
    assert.match(error.message, /Version 0\.2\.0 is still in review/);
    return true;
  });
  assert.equal(sent.length, 1);
});

test('an upload that runs in the background is polled until it succeeds', async () => {
  const { deps, sent } = fakeStore([
    { body: {} },
    { body: { uploadState: 'IN_PROGRESS' } },
    { body: { lastAsyncUploadState: 'IN_PROGRESS' } },
    { body: { lastAsyncUploadState: 'SUCCEEDED' } },
    { body: { state: 'PENDING_REVIEW' } },
  ]);
  await publishVersion(deps, item, { zip, version: '0.3.0' });
  assert.equal(sent.filter((s) => s.url.endsWith(':fetchStatus')).length, 3);
});

test('a failed upload stops before the submission', async () => {
  const { deps, sent } = fakeStore([{ body: {} }, { body: { uploadState: 'FAILED' } }]);
  await assert.rejects(publishVersion(deps, item, { zip, version: '0.3.0' }), /upload ended in state FAILED/);
  assert.equal(
    sent.some((s) => s.url.endsWith(':publish')),
    false,
  );
});

test('an upload whose manifest version differs from the release stops the publish', async () => {
  const { deps } = fakeStore([{ body: {} }, { body: { uploadState: 'SUCCEEDED', crxVersion: '0.2.0' } }]);
  await assert.rejects(publishVersion(deps, item, { zip, version: '0.3.0' }), /read version 0\.2\.0 from the zip/);
});

test('an HTTP error reports the status and the store message', async () => {
  const { deps } = fakeStore([{ status: 403, body: { error: { message: 'The caller does not have permission' } } }]);
  await assert.rejects(publishVersion(deps, item, { zip, version: '0.3.0' }), /HTTP 403.*does not have permission/);
});

test('a submission the store does not accept fails', async () => {
  const { deps } = fakeStore([{ body: {} }, { body: { uploadState: 'SUCCEEDED' } }, { body: { state: 'REJECTED' } }]);
  await assert.rejects(publishVersion(deps, item, { zip, version: '0.3.0' }), /state REJECTED/);
});

test('blockingReason lets a published or rejected item take a new version', () => {
  assert.equal(blockingReason({ publishedItemRevisionStatus: { state: 'PUBLISHED' } }), null);
  assert.equal(blockingReason({ submittedItemRevisionStatus: { state: 'REJECTED' } }), null);
  assert.match(blockingReason({ takenDown: true }) ?? '', /took the item down/);
});
