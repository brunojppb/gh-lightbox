// @ts-check
// Chrome reads the version from manifest.json, and Changesets bumps only package.json.
import { readFile, writeFile } from 'node:fs/promises';

const PACKAGE = new URL('../package.json', import.meta.url);
const MANIFEST = new URL('../extension/manifest.json', import.meta.url);

/**
 * Copies the version in package.json to extension/manifest.json.
 * @returns {Promise<string>} the version
 */
async function syncManifestVersion() {
  const pkg = JSON.parse(await readFile(PACKAGE, 'utf8'));
  const version = pkg.version;
  // Chrome accepts one to four dot-separated integers only, so a prerelease such as 1.0.0-beta.1 fails.
  if (typeof version !== 'string' || !/^\d+(\.\d+){0,3}$/.test(version)) {
    throw new Error(`package.json version "${version}" is not a valid Chrome extension version`);
  }
  const manifest = await readFile(MANIFEST, 'utf8');
  // Replace only the version line, so the hand-written layout of the file stays.
  const versionLine = /("version"\s*:\s*)"[^"]*"/;
  if (!versionLine.test(manifest)) throw new Error('extension/manifest.json has no "version" field');
  await writeFile(MANIFEST, manifest.replace(versionLine, `$1"${version}"`));
  return version;
}

try {
  console.log(`extension/manifest.json version: ${await syncManifestVersion()}`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
