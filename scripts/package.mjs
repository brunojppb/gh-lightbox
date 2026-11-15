// @ts-check
// Builds the zip that goes to the Chrome Web Store and to each GitHub release: dist/gh-lightbox-v<version>.zip.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const EXTENSION = `${ROOT}extension`;
const DIST = `${ROOT}dist`;
// The store rejects a zip without manifest.json at its root. Other file types would be stray files.
const ALLOWED = /^(manifest\.json|loader\.js|icons\/icon-\d+\.png|src\/[\w-]+\.(js|css))$/;

/**
 * Zips extension/ and checks the entries.
 * @returns {string} the zip path
 */
function packageExtension() {
  const { version } = JSON.parse(readFileSync(`${EXTENSION}/manifest.json`, 'utf8'));
  const zip = `${DIST}/gh-lightbox-v${version}.zip`;
  mkdirSync(DIST, { recursive: true });
  rmSync(zip, { force: true });
  // -X leaves out file owner and time extras. The excludes drop dotfiles such as .DS_Store.
  execFileSync('zip', ['-X', '-r', '-q', zip, '.', '-x', '.*', '*/.*'], { cwd: EXTENSION });
  const entries = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' })
    .split('\n')
    .filter((entry) => entry && !entry.endsWith('/'));
  const stray = entries.filter((entry) => !ALLOWED.test(entry));
  const problem = !entries.includes('manifest.json')
    ? 'has no manifest.json at its root'
    : stray.length
      ? `has unexpected files: ${stray.join(', ')}`
      : '';
  if (problem) {
    // A bad zip left in dist/ could still get uploaded by hand.
    rmSync(zip, { force: true });
    throw new Error(`${zip} ${problem}`);
  }
  return zip;
}

try {
  console.log(packageExtension());
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
