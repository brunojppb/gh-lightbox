// lib.dom lacks the Navigation API. This is the part the lightbox uses.
interface Window {
  navigation?: {
    addEventListener(type: 'navigate', listener: (event: { destination: { url: string } }) => void): void;
  };
}
