// Uploads an extension zip to the Chrome Web Store and submits it for review.
// Usage: node scripts/publish-store.ts <zip> <version>
// Environment: CWS_ACCESS_TOKEN, CWS_PUBLISHER_ID, CWS_ITEM_ID.
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { StoreError, publishVersion } from './lib/chrome-web-store.ts';

/** Returns the value of an environment variable, or stops with a message that names it. */
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new StoreError(`Set ${name}.`);
  return value;
}

try {
  const [zipPath, version] = process.argv.slice(2);
  if (!zipPath || !version) throw new StoreError('Usage: node scripts/publish-store.ts <zip> <version>');
  const item = {
    token: required('CWS_ACCESS_TOKEN'),
    publisherId: required('CWS_PUBLISHER_ID'),
    itemId: required('CWS_ITEM_ID'),
  };
  const zip = new Uint8Array(await readFile(zipPath));
  await publishVersion({ fetch, sleep: (ms) => sleep(ms), log: console.log }, item, { zip, version });
} catch (error) {
  console.error(error instanceof StoreError ? error.message : error);
  process.exitCode = 1;
}
