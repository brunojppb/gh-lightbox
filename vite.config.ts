import { defineConfig } from 'vite-plus';

export default defineConfig({
  // Copied as is into the extension: manifest.json and icons.
  publicDir: 'public',
  build: {
    outDir: 'dist/extension',
    emptyOutDir: true,
    target: 'chrome132',
    // The store reviews the code. Readable output makes that review quick, and the bundle is small.
    minify: false,
    lib: {
      entry: 'src/content.ts',
      // A content script cannot be an ES module, so the bundle is one classic script.
      formats: ['iife'],
      name: 'ghLightbox',
      fileName: () => 'content.js',
    },
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
  },
  lint: {
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    singleQuote: true,
    printWidth: 120,
    // The fixtures are copies of GitHub pages, so their markup stays as GitHub wrote it.
    // Markdown keeps its hand-written line breaks.
    ignorePatterns: ['test/e2e/fixtures/**', '**/*.md'],
  },
});
