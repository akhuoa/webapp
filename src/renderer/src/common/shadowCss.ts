// Make some CSS suitable for our shadow root, i.e. make sure that:
//  - CSS custom properties that are defined on `:root` get defined on our shadow host instead, since `:root` doesn't
//    match anything within a shadow root;
//  - rules that target the `html` element (e.g., in Tailwind CSS's preflight) target the root element of our shadow root
//    instead (see app.css), since it plays the role of the `html` element for us; and
//  - `rem` units get converted to `px` units, since a `rem` is relative to the font size of the host document's root
//    element, which a host application may change (e.g., `html { font-size: 62.5%; }`), something that would otherwise
//    scale our whole UI.
// Note #1: selectors and declaration values must be processed separately. Indeed, a selector may contain something that
//          looks like a `rem` value (e.g., Tailwind CSS's `.text-\[1\.5rem\]` class), which must be left alone. So, at
//          build time, we parse our CSS and use toShadowSelector() and toShadowValue() (see
//          scripts/shadow.css.plugin.ts). At run time, we use toShadowCss() for the CSS of our dependencies (see
//          src/common/initialisation.ts), which doesn't have such selectors.
// Note #2: we leave url() values alone since they may contain data URIs, which could contain something that looks like
//          a `rem` value.

export const ROOT_FONT_SIZE = 16; // The default font size of a browser, i.e. the size of `1rem` by default.

const URL_REGEX = /url\([^)]*\)/gi;
const ROOT_REGEX = /:root\b/g;
const HTML_REGEX = /(^|[\s,{}>+~(])html(?=[\s,{.:[>+~)])/g;
const REM_REGEX = /(?<![\w.\\[-])(-?(?:\d+\.?\d*|\.\d+))rem\b/g;

const remToPx = (css: string): string => {
  return css.replace(REM_REGEX, (_match: string, value: string) => {
    return `${Number((Number.parseFloat(value) * ROOT_FONT_SIZE).toFixed(4))}px`;
  });
};

export const toShadowSelector = (selector: string): string => {
  return selector.replace(ROOT_REGEX, ':host').replace(HTML_REGEX, '$1.opencor-shadow-root');
};

export const toShadowValue = (value: string): string => {
  let res = '';
  let lastIndex = 0;

  for (const match of value.matchAll(URL_REGEX)) {
    res += remToPx(value.slice(lastIndex, match.index)) + match[0];

    lastIndex = match.index + match[0].length;
  }

  return res + remToPx(value.slice(lastIndex));
};

export const toShadowCss = (css: string): string => {
  return toShadowValue(toShadowSelector(css));
};
