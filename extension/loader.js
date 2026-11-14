// @ts-check
// MV3 content scripts cannot be ES modules. This classic script is the only one, and it loads the module graph.
import(chrome.runtime.getURL('src/main.js'))
  .then((app) => app.start())
  .catch((error) => console.error('[gh-lightbox] start failed', error));
