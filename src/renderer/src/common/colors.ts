import auraTheme from '@primeuix/themes/aura/base';

// Various colours (from Plotly).

export const PALETTE: Record<string, string> = {
  '#4e79a7': 'Blue',
  '#f28e2b': 'Orange',
  '#e15759': 'Red',
  '#76b7b2': 'Teal',
  '#59a14f': 'Green',
  '#edc948': 'Yellow',
  '#b07aa1': 'Purple',
  '#ff9da7': 'Pink',
  '#9c755f': 'Brown',
  '#bab0ac': 'Gray'
};

export const REVERTED_PALETTE: Record<string, string> = Object.fromEntries(
  Object.entries(PALETTE).map(([hex, name]) => [name, hex])
);

export const PALETTE_COLORS = Object.keys(PALETTE);
export const DEFAULT_COLOR = '#4e79a7'; // Default colour (blue)

// PrimeVue colours.
// Note: we use PrimeVue's Aura theme (see scripts/primevue.css.plugin.ts) which (colour) tokens may reference other
//       tokens (e.g., in dark mode, content.background is "{surface.900}", which itself is "{zinc.900}", i.e.
//       "#18181b").

type TokenTree = { [key: string]: string | TokenTree | undefined };

const tokenValue = (tree: unknown, keys: string[]): string | undefined => {
  // Return the value of the token with the given keys in the given token tree, if any.
  // Note: PrimeVue's token paths are dot-separated versions of its camel-cased keys (e.g., "content.hover.background"
  //       refers to content.hoverBackground), so we try to match one or several of the given keys with a key of the
  //       given token tree.

  if (!keys.length) {
    return typeof tree === 'string' ? tree : undefined;
  }

  if (!tree || typeof tree !== 'object') {
    return undefined;
  }

  for (let i = 1; i <= keys.length; ++i) {
    const key = keys
      .slice(0, i)
      .map((key: string, index: number) => (index ? key.charAt(0).toUpperCase() + key.slice(1) : key))
      .join('');
    const res = tokenValue((tree as TokenTree)[key], keys.slice(i));

    if (res !== undefined) {
      return res;
    }
  }

  return undefined;
};

export const primeVueColor = (token: string, darkMode: boolean): string | undefined => {
  // Return the value of the given PrimeVue (colour) token (e.g., "content.background") for the given colour scheme,
  // resolving any token that it references (e.g., "{surface.900}" or "color-mix(in srgb, {primary.400}, transparent
  // 84%)").
  // Note: a token is looked up in the colour scheme's semantic tokens, then in the common semantic tokens, and finally
  //       in the primitive tokens.

  const trees = [
    darkMode ? auraTheme.semantic?.colorScheme?.dark : auraTheme.semantic?.colorScheme?.light,
    auraTheme.semantic,
    auraTheme.primitive
  ];

  const lookUp = (path: string): string | undefined => {
    for (const tree of trees) {
      const res = tokenValue(tree, path.split('.'));

      if (res !== undefined) {
        return res;
      }
    }

    return undefined;
  };

  const resolve = (value: string | undefined, depth: number): string | undefined => {
    // Resolve the tokens referenced in the given value, if any, making sure that we don't end up in an endless loop
    // (e.g., if two tokens were to reference each other).

    if (value === undefined || depth > 10) {
      return undefined;
    }

    let resolved = true;
    const res = value.replace(/\{([^{}]+)\}/g, (_match: string, reference: string) => {
      const referenceValue = resolve(lookUp(reference), depth + 1);

      resolved &&= referenceValue !== undefined;

      return referenceValue ?? '';
    });

    return resolved ? res : undefined;
  };

  return resolve(lookUp(token), 0);
};

export const cssColor = (color: string, element: Element | null): string => {
  // Resolve the given colour if it is a CSS variable (e.g., "var(--p-surface-200)"), so that it can be used on a
  // canvas.
  // Note #1: this must only be called from our renderer since it uses the DOM.
  // Note #2: we resolve the CSS variable against the given element since our CSS variables are only defined within our
  //          shadow root (see src/common/shadowCss.ts).

  const cssVariable = /^var\((--[\w-]+)\)$/.exec(color)?.[1];

  return cssVariable && element ? getComputedStyle(element).getPropertyValue(cssVariable).trim() || color : color;
};
