/**
 * What the viewport picker decides, with no DOM in the way.
 *
 * Same split as controls-model.js: the block owns the template, the storage
 * and the events, and everything that is arithmetic or policy lives here
 * where a test can reach it without a browser. Both functions are total, so
 * neither can leave the picker in a state the canvas cannot act on.
 */

/**
 * The sizes on offer. `width: null` means "take the space you have", which is
 * the only honest way to describe a responsive frame, and the shell reads it
 * as "do not constrain the iframe" rather than as a missing value.
 */
export const VIEWPORTS = [
  { id: 'responsive', label: 'Responsive', width: null, height: null },
  { id: 'phone', label: 'Phone 375x667', width: 375, height: 667 },
  { id: 'tablet', label: 'Tablet 768x1024', width: 768, height: 1024 },
  { id: 'laptop', label: 'Laptop 1280x800', width: 1280, height: 800 },
  { id: 'custom', label: 'Custom width', width: null, height: null }
];

export const THEMES = ['system', 'light', 'dark'];

/** Narrower than any phone, and wider than any display worth previewing on. */
export const MIN_WIDTH = 160;
export const MAX_WIDTH = 4000;
export const DEFAULT_CUSTOM_WIDTH = 480;

/**
 * The detail a `viewport-change` carries.
 *
 * Custom is the only entry whose size is not in the table, so it is the only
 * one that reads the width, and the width is clamped here rather than left to
 * the input's own `min` and `max`, which a typed or pasted value steps
 * straight past. An id nobody recognises falls back to responsive instead of
 * returning nothing, because a picker that answers "no size at all" would
 * leave the canvas with no width to apply.
 *
 * @param {string} id - one of the VIEWPORTS ids
 * @param {number|string} [customWidth]
 * @returns {{id: string, label: string, width: ?number, height: ?number}}
 */
export function resolveViewport(id, customWidth) {
  const preset = VIEWPORTS.find((entry) => entry.id === id) || VIEWPORTS[0];
  if (preset.id !== 'custom') return { ...preset };
  // An emptied field is no answer, not an answer of zero, and `Number('')` is
  // 0, which would otherwise clamp the frame to its minimum the moment
  // somebody selected the width to retype it.
  const blank = customWidth === '' || customWidth === null || customWidth === undefined;
  const raw = blank ? NaN : Number(customWidth);
  const width = Number.isFinite(raw)
    ? Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(raw)))
    : DEFAULT_CUSTOM_WIDTH;
  return { id: 'custom', label: `Custom ${width}px`, width, height: null };
}

/**
 * What "system" resolves to right now.
 *
 * PROTOCOL.THEME carries `'light'` or `'dark'` and has no third state, and
 * the preview document deliberately no longer follows `prefers-color-scheme`
 * on its own, so somebody has to make the call. It is made here, in the
 * manager, where the media query is already being watched.
 *
 * @param {string} choice - one of THEMES
 * @param {boolean} prefersDark - what the media query says
 * @returns {'light'|'dark'}
 */
export function resolveTheme(choice, prefersDark) {
  if (choice === 'light' || choice === 'dark') return choice;
  return prefersDark ? 'dark' : 'light';
}

/**
 * How a chosen size reads in the toolbar. A preset with both dimensions shows
 * both; a custom width has no height to show, because the frame keeps the
 * canvas height.
 *
 * @param {{width: ?number, height: ?number}} chosen - what resolveViewport returned
 * @returns {string}
 */
export function sizeLabel(chosen) {
  if (!chosen || !chosen.width) return 'fluid';
  return chosen.height ? `${chosen.width} x ${chosen.height}` : `${chosen.width}px`;
}
