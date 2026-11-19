/**
 * lego-studio-controls: a full controls panel with nothing authored.
 *
 * Storybook needs a docgen compiler pass per framework to learn a
 * component's props, and even then argTypes are usually written by hand.
 * LegoDOM declares the contract in the block itself, so `block.props` in the
 * manifest is already a typed, defaulted, machine readable description of
 * every input the block takes. Everything below is a rendering of that, and
 * the panel says so out loud, because the absence of configuration is the
 * feature.
 *
 * The row list is real state rather than a computed on purpose. `b-sync`
 * needs somewhere to write, and pointing it at `row.value` gives the panel
 * both directions for free: typing updates the row, and rebuilding the rows
 * (a reset, a new story) pushes the restored values back into the inputs
 * without anyone touching an element.
 */

import { Lego } from 'lego-dom';
import { applyControlInput, buildControlRows, rowsToArgs } from './controls-model.js';

const template = `
<style>
  :host {
    display: block;
    color: var(--fg);
    font: var(--font-ui);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--gap-2);
    padding: var(--gap-3) var(--gap-3) var(--gap-2);
    border-bottom: 1px solid var(--line);
  }
  .lede {
    flex: 1;
    color: var(--fg-dim);
    font-size: var(--fs-xs);
    line-height: 1.5;
  }
  code {
    font: var(--font-code);
    color: var(--fg-dim);
  }
  .btn {
    appearance: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--fg-dim);
    font: inherit;
    padding: 3px var(--gap-2);
    cursor: pointer;
    transition: color var(--tr), border-color var(--tr);
  }
  .btn:hover { color: var(--fg); border-color: var(--accent); }
  .btn:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 2px;
    border-color: var(--fg);
  }
  .rows { padding: var(--gap-2) 0; }
  .row {
    display: grid;
    gap: 4px;
    padding: var(--gap-2) var(--gap-3);
    border-left: 2px solid transparent;
  }
  /*
   * Two row states, one axis. Edited is a surface one step up with a solid
   * rule down its edge; a row whose value will not parse takes the darker
   * fill and the full strength rule, and its message underneath is the only
   * text in the panel set heavier than the labels around it.
   */
  .row.is-modified { border-left-color: var(--accent); background: var(--accent-bg); }
  .row.is-bad { border-left-color: var(--bad-line); background: var(--bad-bg); }
  .meta {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .name {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--fg);
  }
  .type {
    padding: 0 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line-strong);
    color: var(--fg-faint);
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  .dot {
    color: var(--fg);
    font-size: var(--fs-xs);
    font-weight: 500;
  }
  .input, .json {
    width: 100%;
    box-sizing: border-box;
    appearance: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--fg);
    font: inherit;
    padding: 5px var(--gap-2);
    transition: border-color var(--tr);
  }
  .input:hover, .json:hover { border-color: var(--fg-faint); }
  .json {
    font: var(--font-code);
    resize: vertical;
    min-height: 78px;
  }
  .input:focus-visible, .json:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 2px;
    border-color: var(--fg);
  }
  /*
   * accent-color is the one hook the platform gives for a native checkbox,
   * and without it the browser paints its own blue into an otherwise
   * monochrome panel.
   */
  .check {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    cursor: pointer;
    accent-color: var(--fg);
  }
  .locked {
    padding: 4px var(--gap-2);
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius-sm);
    color: var(--fg-dim);
    font-size: var(--fs-xs);
  }
  .hint {
    display: flex;
    gap: var(--gap-2);
    color: var(--fg-dim);
    font-size: var(--fs-xs);
  }
  .hint .attr { font-family: var(--font-mono); }
  .bad {
    color: var(--bad-fg);
    font: var(--font-code);
    font-weight: 600;
  }
  .none, .undeclared {
    padding: var(--gap-3);
    border-top: 1px solid var(--line);
  }
  .undeclared h3 {
    margin: 0 0 4px;
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
  }
  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: var(--gap-2);
  }
  .key {
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--line-strong);
    color: var(--fg-dim);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
  }
</style>
<div class="head">
  <div class="lede">
    Every control below is generated from the block's <code>b-props</code>.
    There is no <code>argTypes</code> file, and there is nothing to write.
  </div>
  <button type="button" class="btn" @click="reset()" title="Restore the story args and remount">Reset</button>
</div>

<div class="rows">
  <div b-for="row in rows" b-key="name"
    class="row [[ row.modified ? 'is-modified' : '' ]] [[ row.error ? 'is-bad' : '' ]]">
    <div class="meta">
      <span class="name">[[ row.name ]]</span>
      <span class="type">[[ row.type ]]</span>
      <span class="dot" b-if="row.modified" title="Differs from the declared default">modified</span>
    </div>

    <input class="input" type="text" b-if="row.control === 'text'"
      b-sync="row.value" @input="onEdit(row, $event.target.value)">

    <input class="input" type="number" b-if="row.control === 'number'"
      b-sync="row.value" @input="onEdit(row, $event.target.value)">

    <label class="check" b-if="row.control === 'boolean'">
      <input type="checkbox" b-sync="row.value" @change="onEdit(row, $event.target.checked)">
      <span>[[ row.value ? 'true' : 'false' ]]</span>
    </label>

    <textarea class="json" rows="3" spellcheck="false" b-if="row.control === 'json'"
      b-sync="row.value" @input="onEdit(row, $event.target.value)"></textarea>

    <div class="locked" b-if="row.disabled">[[ row.type ]] props are not editable from here.</div>

    <div class="hint">
      <span>default <code>[[ row.defaultLabel || 'none' ]]</code></span>
      <span class="attr">[[ row.attr ]]</span>
    </div>
    <div class="bad" b-if="row.error">[[ row.error ]]</div>
  </div>
</div>

<div class="none" b-if="rows.length === 0">
  This block declares no props, so there is nothing to control. Add a
  <code>b-props</code> attribute and the panel fills itself in.
</div>

<div class="undeclared" b-if="stateKeys.length > 0">
  <h3>State (undeclared)</h3>
  <div class="lede">
    Read only. These are logic keys the block never declared, so nothing can
    write them from outside. Declare one in <code>b-props</code> and it
    becomes a control up there.
  </div>
  <div class="keys">
    <span class="key" b-for="key in stateKeys">[[ key ]]</span>
  </div>
</div>
`;

const logic = {
  rows: [],
  // Declared up front, and not only for documentation. A handler invoked
  // from inside a b-for row runs with `this` bound to a throwaway loop
  // scope whose prototype is the state proxy, and the reactive `set` trap
  // only forwards a write to the real state when the key is already an own
  // property there. An undeclared `this._frame = id` would land on the
  // throwaway and be gone by the next keystroke.
  _frame: 0,

  mounted() {
    this.rebuild();
    this.$watch('descriptors', () => this.rebuild());
    this.$watch('storyId', () => this.rebuild());
    this.$watch('args', (args) => {
      // An args write that already agrees with what the rows say is this
      // panel's own edit coming back around through the shell. Rebuilding on
      // it would replace the row the user is still typing into.
      if (JSON.stringify(args) === JSON.stringify(rowsToArgs(this.rows))) return;
      this.rebuild();
    });
  },

  unmounted() {
    if (this._frame) window.cancelAnimationFrame(this._frame);
  },

  rebuild() {
    this.rows = buildControlRows(this.descriptors, this.args);
  },

  /**
   * One edit. The row is updated whether or not the value parsed, so bad
   * JSON stays on screen with its error, but only a value that parsed is
   * allowed to reach `arg` and therefore the preview.
   */
  onEdit(row, raw) {
    const patch = applyControlInput(row, raw);
    row.error = patch.error;
    row.modified = patch.modified;
    if (!patch.ok) return;
    row.arg = patch.arg;
    // A checkbox is one discrete decision and should land immediately.
    // Typing is a stream, and coalescing it to a frame is the difference
    // between one postMessage per character and one per paint.
    this.publish(row.control === 'boolean');
  },

  publish(immediate) {
    if (immediate) {
      this.flush();
      return;
    }
    if (this._frame) return;
    this._frame = window.requestAnimationFrame(() => {
      this._frame = 0;
      this.flush();
    });
  },

  flush() {
    if (this._frame) {
      window.cancelAnimationFrame(this._frame);
      this._frame = 0;
    }
    this.$emit('args-set', rowsToArgs(this.rows));
  },

  reset() {
    this.$emit('args-reset');
  }
};

Lego.block('lego-studio-controls', {
  template,
  logic,
  props: 'descriptors: Array = [], stateKeys: Array = [], args: Object = {}, storyId: String = ""'
});
