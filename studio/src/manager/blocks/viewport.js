/**
 * lego-studio-viewport: the size and theme picker for the canvas toolbar.
 *
 * The block owns two preferences and nothing else. It never touches the
 * preview frame: the frame belongs to the canvas, which is the one place in
 * the manager allowed to postMessage into it, so this emits `viewport-change`
 * and `theme-change` and lets the shell decide what to do with them.
 *
 * The manager's own `data-theme` is the exception, and deliberately so. It is
 * this document's root element rather than anybody else's, `manager.css`
 * keys its whole palette off it, and the inline script in index.html already
 * reads the same stored value before first paint. Writing it here is what
 * makes the choice survive a reload without a flash of the other theme.
 */

import { Lego } from 'lego-dom';
import {
  DEFAULT_CUSTOM_WIDTH,
  MAX_WIDTH,
  MIN_WIDTH,
  THEMES,
  VIEWPORTS,
  resolveTheme,
  resolveViewport,
  sizeLabel
} from './viewport-model.js';

/** Shared with the shell, which stores `filter` and `tab` under the same key. */
const STORE_KEY = 'lego-studio:manager';

/**
 * localStorage throws outright in a few real contexts (a private window, a
 * sandboxed frame, a browser set to block site data), so both directions are
 * wrapped and a failure only means the preference does not persist.
 */
const readStore = () => {
  try {
    return JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}') || {};
  } catch (e) {
    return {};
  }
};

const writeStore = (patch) => {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(Object.assign(readStore(), patch)));
  } catch (e) {
    /* a preference that will not stick is not a reason to stop working */
  }
};

const template = `
<style>
  :host {
    display: flex;
    align-items: center;
    gap: var(--gap-2);
    color: var(--fg);
    font: var(--font-ui);
  }
  select, input {
    appearance: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--fg-dim);
    font: inherit;
    padding: 3px var(--gap-2);
    transition: color var(--tr), border-color var(--tr);
  }
  select:hover, input:hover { color: var(--fg); border-color: var(--fg-faint); }
  select:focus-visible, input:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 2px;
    border-color: var(--fg);
  }
  input[type="number"] {
    width: 68px;
    font-variant-numeric: tabular-nums;
  }
  .group {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .swatch {
    appearance: none;
    border: 0;
    border-left: 1px solid var(--line-strong);
    background: var(--bg-input);
    color: var(--fg-faint);
    font: inherit;
    padding: 3px var(--gap-2);
    cursor: pointer;
    text-transform: capitalize;
    transition: color var(--tr), background var(--tr);
  }
  .swatch:first-child { border-left: 0; }
  .swatch:hover { color: var(--fg-dim); }
  .swatch:focus-visible { outline: 1px solid var(--fg); outline-offset: -2px; }
  /*
   * The picked entry is a filled cell with the text at full strength, not a
   * tinted one. The palette carries no hue to tint with.
   */
  .swatch.is-on {
    background: var(--accent-bg);
    color: var(--fg);
    font-weight: 500;
  }
  .size {
    color: var(--fg-faint);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
    min-width: 62px;
  }
</style>

<select aria-label="Viewport size" b-sync="viewport" @change="onViewport()">
  <option b-for="entry in presets" value="[[ entry.id ]]">[[ entry.label ]]</option>
</select>

<input type="number" aria-label="Custom viewport width" b-if="viewport === 'custom'"
  min="[[ minWidth ]]" max="[[ maxWidth ]]" step="10" b-sync="customWidth" @input="onViewport()">

<span class="size">[[ sizeLabel ]]</span>

<div class="group" role="group" aria-label="Theme">
  <button type="button" class="swatch [[ theme === name ? 'is-on' : '' ]]"
    b-for="name in themes" @click="setTheme(name)" title="[[ name ]] theme">[[ name ]]</button>
</div>
`;

const logic = {
  presets: VIEWPORTS,
  themes: THEMES,
  minWidth: MIN_WIDTH,
  maxWidth: MAX_WIDTH,
  viewport: 'responsive',
  customWidth: DEFAULT_CUSTOM_WIDTH,
  theme: 'system',
  // See the note in controls.js: a handler called from inside a b-for row
  // runs against a throwaway scope whose writes only reach real state for
  // keys that already exist there, so the frame handle is declared up front.
  _frame: 0,

  get sizeLabel() {
    return sizeLabel(resolveViewport(this.viewport, this.customWidth));
  },

  mounted() {
    const stored = readStore();
    if (VIEWPORTS.some((entry) => entry.id === stored.viewport)) this.viewport = stored.viewport;
    if (Number.isFinite(Number(stored.viewportWidth))) this.customWidth = Number(stored.viewportWidth);
    if (THEMES.includes(stored.theme)) this.theme = stored.theme;

    // "system" is a live choice rather than a stored answer, so the manager
    // and the preview both have to follow the operating system as it changes.
    if (window.matchMedia) {
      this._media = window.matchMedia('(prefers-color-scheme: dark)');
      this._onScheme = () => {
        if (this.theme === 'system') this.publishTheme();
      };
      this._media.addEventListener('change', this._onScheme);
    }

    // The shell has no idea what was restored until it is told, so the first
    // state is announced rather than waiting for an interaction.
    this.publishTheme();
    this.publishViewport();
  },

  unmounted() {
    if (this._frame) window.cancelAnimationFrame(this._frame);
    if (this._media && this._onScheme) this._media.removeEventListener('change', this._onScheme);
  },

  /**
   * Dragging the custom width is a stream of input events, and one
   * postMessage per keystroke is one per keystroke more than the canvas
   * needs. Picking a preset is a single decision and lands immediately.
   */
  onViewport() {
    if (this.viewport !== 'custom') {
      this.publishViewport();
      return;
    }
    if (this._frame) return;
    this._frame = window.requestAnimationFrame(() => {
      this._frame = 0;
      this.publishViewport();
    });
  },

  setTheme(name) {
    if (!THEMES.includes(name)) return;
    this.theme = name;
    this.publishTheme();
  },

  publishViewport() {
    const chosen = resolveViewport(this.viewport, this.customWidth);
    writeStore({ viewport: this.viewport, viewportWidth: this.customWidth });
    this.$emit('viewport-change', chosen);
  },

  publishTheme() {
    const prefersDark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const resolved = resolveTheme(this.theme, prefersDark);

    writeStore({ theme: this.theme });
    // No attribute at all is what tells manager.css to follow the operating
    // system, so "system" removes it rather than writing the resolved value.
    if (this.theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.setAttribute('data-theme', this.theme);
    }

    this.$emit('theme-change', { theme: this.theme, resolved });
  }
};

Lego.block('lego-studio-viewport', { template, logic });
