/**
 * lego-studio-hydration: the server render, the client render, and the gap.
 *
 * This is the panel Storybook cannot have. LegoDOM renders a block to HTML in
 * Node and hydrates that markup in the browser out of one definition
 * registry, so a story can be rendered twice, by two engines, from the same
 * source, and the two answers put side by side. When they disagree, one of
 * the two engines is wrong about the framework's own semantics, and that is a
 * bug nobody would otherwise find until a server rendered page flickered in
 * production.
 *
 * The transport and the comparison live in hydration-model.js, which has no
 * DOM in it and is where the story id gates are tested. This file is the
 * template, the states it can be in, and the modal.
 */

import { Lego } from 'lego-dom';
import {
  RENDER_GRACE,
  channel,
  createPreviewChannel,
  diffRows,
  fetchServerHTML,
  runComparison,
  splitRows
} from './hydration-model.js';

/** Rows drawn before the list stops and says how many it is holding back. */
const MAX_ROWS = 60;

/* ------------------------------------------------------------------ *
 * The block
 * ------------------------------------------------------------------ */

const template = `
<style>
  :host {
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    height: 100%;
    color: var(--fg);
    font: var(--font-ui);
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--gap-2);
    padding: var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  .lede {
    flex: 1;
    color: var(--fg-faint);
    font-size: var(--fs-xs);
    line-height: 1.5;
  }
  code { font: var(--font-code); color: var(--fg-dim); }
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
  /*
   * The three states separate by fill and by border weight rather than by
   * hue, because the manager's palette has no hue to separate them with. A
   * match is the quiet one: no fill, no rule, dimmed text.
   */
  .status {
    display: flex;
    align-items: baseline;
    gap: var(--gap-2);
    padding: var(--gap-2) var(--gap-3);
    border-bottom: 1px solid var(--line);
    border-left: 2px solid transparent;
    font-size: var(--fs-sm);
    color: var(--fg-dim);
  }
  .status .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--fg-faint);
  }
  .status.is-match .dot { background: var(--good-line); }
  /*
   * Waiting is not an error and must not dress like one, but it also must not
   * look like nothing: an empty panel with no explanation is what made this
   * read as the comparison returning different answers for one block, when it
   * was really the preview not having rendered yet.
   */
  .status.is-busy { color: var(--fg-faint); }
  .status.is-busy .dot {
    background: var(--fg-faint);
    animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse { 50% { opacity: 0.25; } }
  @media (prefers-reduced-motion: reduce) {
    .status.is-busy .dot { animation: none; }
  }
  .status.is-diverged {
    border-left-color: var(--bad-line);
    background: var(--bad-bg);
    color: var(--bad-fg);
    font-weight: 600;
  }
  .status.is-diverged .dot { background: var(--bad-fg); }
  .status.is-error {
    border-left-color: var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn-fg);
  }
  .status.is-error .dot { background: var(--warn-line); }
  .status .text { flex: 1; white-space: pre-wrap; }
  .tabs {
    display: flex;
    height: var(--tabs-h);
    border-bottom: 1px solid var(--line);
  }
  .tab {
    appearance: none;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--fg-faint);
    font: inherit;
    padding: 0 var(--gap-3);
    cursor: pointer;
    transition: color var(--tr);
  }
  .tab:hover { color: var(--fg-dim); }
  .tab:focus-visible { outline: 1px solid var(--fg); outline-offset: -2px; }
  .tab.is-on { color: var(--fg); border-bottom-color: var(--accent); font-weight: 500; }
  .body { overflow: auto; }
  .rows { border-bottom: 1px solid var(--line); }
  .row {
    display: grid;
    grid-template-columns: 68px minmax(0, 1fr);
    gap: var(--gap-2);
    align-items: baseline;
    padding: var(--gap-2) var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  .kind {
    justify-self: start;
    padding: 0 5px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--line-strong);
    font-size: 10px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--fg-faint);
  }
  /* Loudest for structure, quietest for attributes, in that order. */
  .kind.is-element, .kind.is-missing, .kind.is-extra {
    color: var(--bad-fg);
    border-color: var(--bad-line);
    background: var(--bad-bg);
    font-weight: 600;
  }
  .kind.is-text {
    color: var(--warn-fg);
    border-color: var(--warn-line);
    background: var(--warn-bg);
  }
  .kind.is-attribute {
    color: var(--tint-fg);
    border-color: var(--tint-line);
    background: var(--tint-bg);
  }
  .where {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--fg-dim);
    overflow-wrap: anywhere;
  }
  .sides { display: grid; gap: 2px; margin-top: 4px; }
  .side {
    display: grid;
    grid-template-columns: 46px minmax(0, 1fr);
    gap: var(--gap-2);
    font: var(--font-code);
    overflow-wrap: anywhere;
  }
  .side .who { color: var(--fg-faint); }
  .side .what { color: var(--fg); }
  .side .absent { color: var(--fg-faint); font-style: italic; }
  .more { padding: var(--gap-2) var(--gap-3); color: var(--fg-faint); font-size: var(--fs-xs); }
  pre {
    margin: 0;
    padding: var(--gap-3);
    font: var(--font-code);
    white-space: pre;
    overflow-x: auto;
  }
  /*
   * The one place in the manager that carries a hue, and deliberately. Red and
   * green for removed and added is a convention people read without thinking,
   * and the tokens behind it are declared in manager.css so it is obvious the
   * exception is on purpose. The leading - and + stay in the text and are not
   * decoration: they are what makes the diff still readable for someone who
   * cannot separate the two hues.
   */
  .diff { display: grid; }
  .line {
    padding: 0 var(--gap-3);
    font: var(--font-code);
    white-space: pre;
  }
  .line.hunk { color: var(--diff-meta-fg); background: var(--bg-hover); }
  .line.del { color: var(--diff-del-fg); background: var(--diff-del-bg); }
  .line.ins { color: var(--diff-add-fg); background: var(--diff-add-bg); }
  .idle { padding: var(--gap-4) var(--gap-3); color: var(--fg-faint); }

  /*
   * The modal. Its frame is chrome and stays monochrome; the only colour
   * inside it is the diff content, which reuses the rules above.
   */
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    display: grid;
    /*
     * Stretched across, pinned to the top. The sheet takes the width because
     * a diff is a wide thing, and takes only the height it needs because a
     * three line diff in a full screen box reads as a bug rather than as a
     * short diff.
     */
    place-items: start stretch;
    padding: var(--gap-4);
    background: var(--bad-scrim);
    backdrop-filter: blur(2px);
  }
  .sheet {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    min-height: 0;
    max-height: 100%;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-raised);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.28);
    overflow: hidden;
  }
  .sheet-head {
    display: flex;
    align-items: center;
    gap: var(--gap-3);
    padding: var(--gap-2) var(--gap-3);
    border-bottom: 1px solid var(--line);
  }
  .sheet-head h2 {
    margin: 0;
    font-size: var(--fs-sm);
    font-weight: 600;
  }
  .sheet-head .tally { color: var(--fg-faint); font-variant-numeric: tabular-nums; }
  .sheet-head .spacer { flex: 1; }
  .toggle {
    display: inline-flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
  }
  .toggle button {
    appearance: none;
    border: 0;
    border-left: 1px solid var(--line-strong);
    background: var(--bg-input);
    color: var(--fg-faint);
    font: inherit;
    padding: 3px var(--gap-2);
    cursor: pointer;
    transition: color var(--tr), background var(--tr);
  }
  .toggle button:first-child { border-left: 0; }
  .toggle button:hover { color: var(--fg-dim); }
  .toggle button:focus-visible { outline: 1px solid var(--fg); outline-offset: -2px; }
  .toggle button.is-on { background: var(--accent-bg); color: var(--fg); font-weight: 500; }
  .sheet .rows { max-height: 34vh; overflow: auto; }
  .sheet-body { min-height: 0; overflow: auto; }
  /*
   * Long lines scroll rather than wrap by default: a wrapped diff loses the
   * column alignment that makes it readable in the first place. The toggle is
   * there for the times a single very long line is the thing being read.
   */
  .sheet-body.is-wrapped .line,
  .sheet-body.is-wrapped .cell { white-space: pre-wrap; overflow-wrap: anywhere; }
  .split { display: grid; grid-template-columns: 1fr 1fr; }
  .split .pair { display: contents; }
  .cell {
    padding: 0 var(--gap-3);
    font: var(--font-code);
    white-space: pre;
    border-left: 1px solid var(--line);
    min-width: 0;
  }
  .cell:first-child { border-left: 0; }
  /* A hunk header describes both sides, so it runs across both of them. */
  .cell.span { grid-column: 1 / -1; border-left: 0; }
  .cell.blank { background: var(--bg-hover); }
  .cell.hunk { color: var(--diff-meta-fg); background: var(--bg-hover); }
  .cell.del { color: var(--diff-del-fg); background: var(--diff-del-bg); }
  .cell.ins { color: var(--diff-add-fg); background: var(--diff-add-bg); }
</style>

<div class="head">
  <div class="lede">
    One story, rendered twice: once by <code>lego-dom/server</code> in Node and
    once by the browser in the preview frame. Both come from the same block
    definitions, so anything below is the two engines disagreeing.
  </div>
  <button type="button" class="btn" b-if="diff" b-var="expandButton" @click="expand()"
    title="Open the diff over the whole window">Expand</button>
  <button type="button" class="btn" @click="run()" title="Render both sides again">Re-check</button>
</div>

<div class="status [[ statusClass ]]">
  <span class="dot"></span>
  <span class="text">[[ message ]]</span>
</div>

<div class="tabs">
  <button type="button" class="tab [[ tab === 'diff' ? 'is-on' : '' ]]" @click="show('diff')">Diff</button>
  <button type="button" class="tab [[ tab === 'server' ? 'is-on' : '' ]]" @click="show('server')">Server</button>
  <button type="button" class="tab [[ tab === 'client' ? 'is-on' : '' ]]" @click="show('client')">Client</button>
</div>

<div class="body">
  <div b-if="tab === 'diff'">
    <div class="rows" b-if="visibleDifferences.length > 0">
      <div class="row" b-for="entry in visibleDifferences">
        <span class="kind is-[[ entry.kind ]]">[[ entry.kind ]]</span>
        <div>
          <div class="where">[[ entry.path || '(root)' ]]</div>
          <div class="sides">
            <div class="side server">
              <span class="who">server</span>
              <span class="what [[ entry.server === null ? 'absent' : '' ]]">[[ entry.server === null ? 'not rendered' : entry.server ]]</span>
            </div>
            <div class="side client">
              <span class="who">client</span>
              <span class="what [[ entry.client === null ? 'absent' : '' ]]">[[ entry.client === null ? 'not rendered' : entry.client ]]</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="more" b-if="hiddenCount > 0">
      [[ hiddenCount ]] further difference(s) not listed. The diff below has all of them.
    </div>
    <div class="diff" b-if="lines.length > 0">
      <div class="line [[ line.kind ]]" b-for="line in lines" b-key="id">[[ line.text ]]</div>
    </div>
    <div class="idle" b-if="phase === 'match'">
      Nothing to show. The normalised markup is identical on both sides.
    </div>
    <div class="idle" b-if="phase === 'idle' || phase === 'running' || phase === 'waiting'">[[ message ]]</div>
  </div>

  <pre b-if="tab === 'server'">[[ serverHTML || message ]]</pre>
  <pre b-if="tab === 'client'">[[ clientHTML || message ]]</pre>
</div>

<div class="scrim" b-if="expanded"
  @click.self="collapse()"
  @keydown.escape.prevent="collapse()"
  @keydown.tab="trapFocus($event)">
  <div class="sheet" role="dialog" aria-modal="true" aria-label="Hydration diff">
    <div class="sheet-head">
      <h2>[[ storyId ]]</h2>
      <span class="tally">[[ differences.length ]] difference(s)</span>
      <span class="spacer"></span>
      <div class="toggle" role="group" aria-label="Diff layout">
        <button type="button" class="[[ layout === 'unified' ? 'is-on' : '' ]]"
          @click="setLayout('unified')">Unified</button>
        <button type="button" class="[[ layout === 'split' ? 'is-on' : '' ]]"
          @click="setLayout('split')">Split</button>
      </div>
      <div class="toggle" role="group" aria-label="Line wrapping">
        <button type="button" class="[[ wrap ? 'is-on' : '' ]]"
          aria-pressed="[[ wrap ? 'true' : 'false' ]]" @click="toggleWrap()">Wrap</button>
      </div>
      <button type="button" class="btn" b-var="closeButton" @click="collapse()"
        aria-label="Close the diff">Close</button>
    </div>

    <div class="rows" b-if="differences.length > 0">
      <div class="row" b-for="entry in differences">
        <span class="kind is-[[ entry.kind ]]">[[ entry.kind ]]</span>
        <div>
          <div class="where">[[ entry.path || '(root)' ]]</div>
          <div class="sides">
            <div class="side server">
              <span class="who">server</span>
              <span class="what [[ entry.server === null ? 'absent' : '' ]]">[[ entry.server === null ? 'not rendered' : entry.server ]]</span>
            </div>
            <div class="side client">
              <span class="who">client</span>
              <span class="what [[ entry.client === null ? 'absent' : '' ]]">[[ entry.client === null ? 'not rendered' : entry.client ]]</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="sheet-body [[ wrap ? 'is-wrapped' : '' ]]">
      <div class="diff" b-if="layout === 'unified'">
        <div class="line [[ line.kind ]]" b-for="line in lines" b-key="id">[[ line.text ]]</div>
      </div>
      <div class="split" b-if="layout === 'split'">
        <div class="pair" b-for="pair in pairs" b-key="id">
          <div class="cell hunk span" b-if="pair.kind === 'hunk'">[[ pair.left ]]</div>
          <div class="cell [[ pair.left === null ? 'blank' : pair.kind === 'change' ? 'del' : pair.kind ]]"
            b-if="pair.kind !== 'hunk'">[[ pair.left === null ? '' : pair.left ]]</div>
          <div class="cell [[ pair.right === null ? 'blank' : pair.kind === 'change' ? 'ins' : pair.kind ]]"
            b-if="pair.kind !== 'hunk'">[[ pair.right === null ? '' : pair.right ]]</div>
        </div>
      </div>
    </div>
  </div>
</div>
`;

const logic = {
  phase: 'idle',
  message: 'Select a story to compare.',
  tab: 'diff',
  serverHTML: '',
  clientHTML: '',
  diff: '',
  differences: [],
  expanded: false,
  layout: 'unified',
  wrap: false,
  // Every comparison is two async round trips, and a person clicking through
  // the sidebar starts several before the first one lands. The token says
  // which one is still wanted, so a stale answer is dropped rather than
  // painted over a newer story's result. It guards against a *newer* story
  // arriving mid flight; the id checks in the channel and in runComparison
  // are what guard against an *older* one answering promptly and wrongly.
  _token: 0,
  // The bounded fallback timer, declared up front so the reactive set trap
  // forwards writes to it.
  _fallback: 0,
  // Declared rather than assigned into existence in mounted(): a logic object
  // is the block's whole state surface, and a key that only ever appears at
  // runtime is a key nothing else can see.
  _stopRendered: null,

  get statusClass() {
    if (this.phase === 'match') return 'is-match';
    if (this.phase === 'diverged') return 'is-diverged';
    if (this.phase === 'error') return 'is-error';
    if (this.phase === 'waiting' || this.phase === 'running') return 'is-busy';
    return '';
  },

  get visibleDifferences() {
    return this.differences.slice(0, MAX_ROWS);
  },

  get hiddenCount() {
    return Math.max(0, this.differences.length - MAX_ROWS);
  },

  get lines() {
    return diffRows(this.diff);
  },

  get pairs() {
    return splitRows(this.lines);
  },

  mounted() {
    // A story change is not a cue to compare, only a cue to stop showing the
    // last answer. The preview has not rendered the new story yet, and asking
    // it now is what made this panel intermittent: whichever of the manager's
    // RENDER and this panel's SERIALIZE won an unordered race decided whether
    // the result was right, wrong, or a coincidental match.
    this.$watch('storyId', () => {
      if (!this.storyId) {
        this.reset('idle', 'Select a story to compare.');
        return;
      }
      this.awaitRender();
    });
    // An explicit re-run: the person asked, or the story was remounted, which
    // produces a fresh client render worth comparing again.
    this.$watch('nonce', () => this.run());

    if (channel) {
      this._stopRendered = channel.onRendered((data) => {
        if (!this.storyId || data.error) return;
        if (data.storyId && data.storyId !== this.storyId) return;
        this.run();
      });
    }

    // The preview may already have rendered this story before the panel was
    // ever opened, in which case no RENDERED is coming and the run above
    // would never fire. The id check inside request() makes an early ask
    // safe: a reply about another story is treated as a miss and retried.
    if (this.storyId) this.run();
  },

  unmounted() {
    this.clearFallback();
    if (this._stopRendered) {
      this._stopRendered();
      this._stopRendered = null;
    }
    // The modal is fixed positioned and outlives nothing, but the class it
    // puts on the manager's own root does, so it is always taken back off.
    this.releasePage();
  },

  show(tab) {
    this.tab = tab;
  },

  setLayout(layout) {
    this.layout = layout;
  },

  toggleWrap() {
    this.wrap = !this.wrap;
  },

  /* ---------------------------------------------------------------- *
   * The modal
   * ---------------------------------------------------------------- */

  /**
   * Open the diff over the whole window.
   *
   * The element that opened it is remembered rather than assumed, because
   * Expand is not the only way in once a keyboard is involved, and focus has
   * to go back where it came from rather than to the top of the panel.
   */
  expand() {
    if (this.expanded) return;
    const root = this.$element.shadowRoot;
    // Whatever had focus, or the Expand control itself. A pointer click leaves
    // focus on the button, but a programmatic open leaves it nowhere, and
    // "nowhere" is not somewhere to send it back to.
    this._returnFocus = (root && root.activeElement) || this.$vars.expandButton || null;
    this.expanded = true;
    document.documentElement.style.setProperty('overflow', 'hidden');
    // The close button only exists after the render that the flag above
    // triggers, so focus waits for it.
    Lego.nextTick().then(() => {
      const close = this.$vars.closeButton;
      if (close) close.focus();
    });
  },

  collapse() {
    if (!this.expanded) return;
    this.expanded = false;
    this.releasePage();
    const back = this._returnFocus;
    this._returnFocus = null;
    if (back && typeof back.focus === 'function') back.focus();
  },

  releasePage() {
    document.documentElement.style.removeProperty('overflow');
  },

  /**
   * Keep Tab inside the dialog.
   *
   * `document.activeElement` reports the manager's own host from out here, so
   * the shadow root is what has to be asked who actually has focus. The list
   * is rebuilt per keystroke because the toggles change which controls exist.
   */
  trapFocus(event) {
    if (!this.expanded) return;
    const root = this.$element.shadowRoot;
    if (!root) return;
    const sheet = root.querySelector('.sheet');
    if (!sheet) return;

    const focusable = [...sheet.querySelectorAll('button, [href], input, select, textarea, [tabindex]')]
      .filter((el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1');
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = root.activeElement;

    if (event.shiftKey && (active === first || !sheet.contains(active))) {
      event.preventDefault();
      last.focus();
      return;
    }
    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  },

  /**
   * Stop showing the previous answer and say what is being waited for.
   *
   * A story change is not a cue to compare. The preview has not mounted the
   * new story yet, and the empty panel people saw here was not a value bug
   * but this state with nothing written in it, which is why it read as the
   * panel returning different answers for the same block.
   *
   * The timer is the bounded fallback. RENDERED normally arrives first and
   * cancels it; if the panel opened after the preview had already finished,
   * or a RENDERED went missing, one ask still happens. It is safe because
   * every layer below checks the id, so the worst case is a retry rather
   * than a stale answer.
   */
  awaitRender() {
    const storyId = this.storyId;
    this._token = this._token + 1;
    this.reset('waiting', `Waiting for the preview to render ${storyId}...`);
    this.clearFallback();
    this._fallback = window.setTimeout(() => {
      this._fallback = 0;
      if (this.storyId !== storyId) return;
      if (this.phase !== 'waiting') return;
      this.run();
    }, RENDER_GRACE);
  },

  clearFallback() {
    if (!this._fallback) return;
    window.clearTimeout(this._fallback);
    this._fallback = 0;
  },

  /**
   * Compare both sides.
   *
   * Called from the watchers and from Re-check, and it never short circuits
   * on "the story did not change": the whole reason to press the button is
   * that something outside this panel did.
   */
  async run() {
    this.clearFallback();
    const storyId = this.storyId;
    if (!storyId) {
      this.reset('idle', 'Select a story to compare.');
      return;
    }
    if (!channel) {
      this.reset('error', 'No window to talk to the preview through.');
      return;
    }

    const token = this._token + 1;
    this._token = token;
    this.reset('running', `Rendering ${storyId} on both sides...`);

    const next = await runComparison(storyId, {
      server: () => fetchServerHTML(storyId),
      client: () => channel.request(storyId)
    });

    // A newer story was picked while this one was in flight.
    if (this._token !== token) return;

    this.phase = next.phase;
    this.message = next.message;
    this.serverHTML = next.serverHTML;
    this.clientHTML = next.clientHTML;
    this.diff = next.diff;
    this.differences = next.differences;
  },

  reset(phase, message) {
    this.phase = phase;
    this.message = message;
    this.serverHTML = '';
    this.clientHTML = '';
    this.diff = '';
    this.differences = [];
  }
};

Lego.block('lego-studio-hydration', {
  template,
  logic,
  props: 'storyId: String = "", nonce: Number = 0'
});
