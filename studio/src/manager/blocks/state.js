/**
 * lego-studio-state: the block's serialisable state, read only.
 *
 * Deliberately not editable. The previous studio offered an editable JSON
 * blob that assigned the parsed result to `el.state`, which is a shallow
 * merge: a key you deleted in the textarea stayed on the block, and the panel
 * showed a document that did not describe the running block. A view that
 * lies is worse than no view. Controls are the editing surface, and they
 * write through the prop contract, which is the only channel the framework
 * actually supports.
 */

import { Lego } from 'lego-dom';

const template = `
<style>
  :host {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    color: var(--fg);
    font: var(--font-ui);
  }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--gap-2);
    padding: var(--gap-2) var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  .bar .title { flex: 1; color: var(--fg-dim); }
  /*
   * A green pip was doing all the work here. Without it, stale is a hollow
   * ring inside a mid gray pill and live is a solid dot inside a full
   * strength one, which is the same distinction the eye was actually making
   * anyway: filled or not filled.
   */
  .status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--line-strong);
    color: var(--fg-faint);
    font-size: var(--fs-xs);
  }
  .status .pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1px solid var(--fg-faint);
    background: transparent;
  }
  .status.is-live {
    border-color: var(--good-line);
    color: var(--good-fg);
    font-weight: 500;
  }
  .status.is-live .pip { border-color: var(--good-fg); background: var(--good-fg); }
  pre {
    margin: 0;
    padding: var(--gap-3);
    overflow: auto;
    font: var(--font-code);
    color: var(--fg-dim);
    white-space: pre;
  }
  .note {
    padding: var(--gap-2) var(--gap-3);
    border-top: 1px solid var(--line);
    color: var(--fg-dim);
    font-size: var(--fs-xs);
    line-height: 1.5;
  }
  code { font: var(--font-code); color: var(--fg-dim); }
</style>
<div class="bar">
  <span class="title">Block state</span>
  <span class="status [[ live ? 'is-live' : '' ]]">
    <span class="pip"></span>[[ live ? 'Live' : 'Stale' ]]
  </span>
</div>
<pre>[[ pretty ]]</pre>
<div class="note">
  Read only, on purpose. Assigning a whole state object shallow merges and
  can never delete a key, so an editable view here would show a document the
  block does not have. Edit through <code>Controls</code> instead.
</div>
`;

const logic = {
  get pretty() {
    const snapshot = this.snapshot;
    if (snapshot === null || snapshot === undefined) return 'No state reported yet.';
    try {
      return JSON.stringify(snapshot, null, 2);
    } catch (e) {
      return `Could not serialise state: ${e.message}`;
    }
  }
};

Lego.block('lego-studio-state', {
  template,
  logic,
  props: 'snapshot: Object = null, live: Boolean = false'
});
