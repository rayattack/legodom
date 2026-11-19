/**
 * lego-studio-actions: what the block emitted, and what it says it emits.
 *
 * The seeded list at the top is the part worth having. Discovery already
 * knows every `$emit('x')` in the block's script, so the panel can show the
 * block's event surface before a single interaction, greyed out until each
 * one actually fires. That turns "nothing has happened yet" into a checklist,
 * and it makes a never-firing event visible instead of invisible.
 */

import { Lego } from 'lego-dom';

const template = `
<style>
  :host {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    height: 100%;
    color: var(--fg);
    font: var(--font-ui);
  }
  .declared {
    padding: var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 var(--gap-2);
    font-size: var(--fs-xs);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--fg-faint);
  }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  /*
   * Waiting is dashed, empty and faint. Fired is solid, filled and at full
   * strength. Two states, four differences, none of them a hue, so the
   * checklist still reads at a glance.
   */
  .chip {
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    border: 1px dashed var(--line-strong);
    color: var(--fg-faint);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    transition: color var(--tr), border-color var(--tr), background-color var(--tr);
  }
  .chip.is-fired {
    border-style: solid;
    border-color: var(--accent);
    background: var(--accent-bg);
    color: var(--fg);
    font-weight: 500;
  }
  .none { color: var(--fg-dim); font-size: var(--fs-xs); }
  .bar {
    display: flex;
    align-items: center;
    gap: var(--gap-2);
    padding: var(--gap-2) var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  .bar .count {
    flex: 1;
    color: var(--fg-faint);
    font-variant-numeric: tabular-nums;
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
  .log { overflow: auto; }
  .entry {
    border-bottom: 1px solid var(--line);
    padding: var(--gap-2) var(--gap-3);
  }
  .entry summary {
    display: flex;
    align-items: baseline;
    gap: var(--gap-2);
    cursor: pointer;
    list-style: none;
  }
  .entry summary:focus-visible { outline: 1px solid var(--fg); outline-offset: 2px; }
  .entry summary::-webkit-details-marker { display: none; }
  .entry .name {
    flex: 1;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--fg);
  }
  .entry .when {
    color: var(--fg-faint);
    font-size: var(--fs-xs);
    font-variant-numeric: tabular-nums;
  }
  .entry pre {
    margin: var(--gap-2) 0 0;
    padding: var(--gap-2);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--fg-dim);
    font: var(--font-code);
    white-space: pre-wrap;
    overflow-x: auto;
  }
  .empty { padding: var(--gap-4) var(--gap-3); color: var(--fg-dim); }
</style>
<div class="declared">
  <h3>Declared events</h3>
  <div class="chips" b-if="declared.length > 0">
    <span class="chip [[ fired[name] ? 'is-fired' : '' ]]" b-for="name in declared">[[ name ]]</span>
  </div>
  <div class="none" b-if="declared.length === 0">This block calls no $emit().</div>
</div>
<div class="bar">
  <span class="count">[[ entries.length ]] logged[[ entries.length === 200 ? ' (capped)' : '' ]]</span>
  <button type="button" class="btn" @click="$emit('log-clear')">Clear</button>
</div>
<div class="log">
  <details class="entry" b-for="entry in entries" b-key="id">
    <summary>
      <span class="name">[[ entry.name ]]</span>
      <span class="when">[[ ago(entry.at) ]]</span>
    </summary>
    <pre>[[ pretty(entry.detail) ]]</pre>
  </details>
  <div class="empty" b-if="entries.length === 0">
    Nothing emitted yet. Interact with the preview and events land here.
  </div>
</div>
`;

const logic = {
  // A ticking clock is the only way relative timestamps stay honest. Reading
  // it from ago() makes every row's binding depend on it, so one tick per
  // second re-renders the log and nothing else.
  now: Date.now(),

  mounted() {
    this._timer = window.setInterval(() => { this.now = Date.now(); }, 1000);
  },

  unmounted() {
    if (this._timer) window.clearInterval(this._timer);
  },

  ago(at) {
    const seconds = Math.max(0, Math.round((this.now - Number(at)) / 1000));
    if (seconds < 1) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.round(minutes / 60)}h ago`;
  },

  pretty(detail) {
    if (detail === null || detail === undefined) return 'no detail';
    try {
      return JSON.stringify(detail, null, 2);
    } catch (e) {
      return String(detail);
    }
  }
};

Lego.block('lego-studio-actions', {
  template,
  logic,
  props: 'entries: Array = [], declared: Array = [], fired: Object = {}'
});
