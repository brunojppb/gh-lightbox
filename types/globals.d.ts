// Only the extension API this project calls, so the check needs no @types/chrome.
declare const chrome: {
  runtime: { getURL(path: string): string };
};

// If lib.dom lacks the Navigation API, declare `navigation` with only `addEventListener('navigate', ...)`
// and `NavigateEvent.destination.url` here.

// lib.dom lacks the Navigation API. This is the part the lightbox uses.
interface Window {
  navigation?: {
    addEventListener(type: 'navigate', listener: (event: { destination: { url: string } }) => void): void;
  };
}
