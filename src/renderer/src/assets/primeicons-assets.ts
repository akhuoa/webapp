// Import the PrimeIcons file that we need, so Vite resolves it correctly in both dev and production modes, then inject
// a @font-face rule.
// Note: we inject our @font-face rule into the host document's head since a @font-face rule doesn't apply within a
//       shadow root in all browsers (e.g., Chromium-based browsers), whereas a font defined in the host document can be
//       used within a shadow root. A @font-face rule doesn't style anything by itself, so it doesn't affect a host
//       application (one that uses PrimeIcons would define the same font anyway), while the rules that use our font
//       (e.g., `.pi`) come from PrimeIcons' CSS, which is in our shadow root (see app.css).

import woff2 from 'primeicons/fonts/primeicons.woff2?inline';

const css = `@font-face {
  font-family: 'primeicons';
  font-display: block;
  src: url('${woff2}') format('woff2');
  font-weight: normal;
  font-style: normal;
}
`;

const existingStyle = document.head.querySelector('style[primeicons-css="injected"]');

if (!existingStyle) {
  const style = document.createElement('style');

  style.setAttribute('primeicons-css', 'injected');
  style.textContent = css;

  document.head.appendChild(style);
}
