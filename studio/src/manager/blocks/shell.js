/**
 * lego-studio-shell: the manager's root block.
 *
 * The shell is the only block here that holds application state. Everything
 * else (sidebar, canvas, the three panels) declares its inputs in `b-props`
 * and reports back by emitting, which is the same props-down / events-up
 * shape a LegoDOM app is meant to have. If that gets painful, the framework
 * has a problem, and finding that out is half the reason the studio manager
 * is written in LegoDOM rather than in the DOM API.
 *
 * The one thing the shell does not own is the postMessage transport. That
 * belongs to the canvas, because the canvas is what holds the iframe, and
 * reaching across a shadow boundary to find someone else's element is exactly
 * the kind of thing this codebase should not be doing. The canvas re-emits
 * everything it hears as a single `preview-msg` event.
 */

import { Lego } from 'lego-dom';
import { serialisable } from '../../core/contracts.js';

const STORE_KEY = 'lego-studio:manager';
const MAX_ACTIONS = 200;
const EMPTY_MANIFEST = { root: '', blocks: {}, order: [], errors: [] };

/**
 * Column sizing.
 *
 * The two side columns are draggable, and the middle one is not: the canvas
 * takes whatever is left, and the only rule it insists on is a floor, because
 * a preview narrower than a phone is not a preview. Every drag is clamped
 * against that floor as well as against the column's own range, so the three
 * tracks can never add up to more than the shell is wide.
 */
const COLUMNS = {
  sidebar: { key: 'sidebarW', min: 180, max: 520, fallback: 252 },
  panel: { key: 'panelW', min: 260, max: 900, fallback: 320 }
};

/** What the canvas keeps for itself, whatever the handles are asked to do. */
const CANVAS_FLOOR = 320;

/** Both handles are one pixel of line. Two of them sit between three tracks. */
const HANDLE_W = 1;

/** How far one arrow key press moves a handle. */
const KEY_STEP = 16;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * localStorage throws outright in a few real contexts (Safari private mode,
 * a sandboxed iframe, a browser configured to block site data), so both
 * directions are wrapped and a failure just means the preference does not
 * persist.
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
    /* preferences are a nicety, not a feature */
  }
};

const template = `
<style>
  :host {
    display: block;
    height: 100%;
    color: var(--fg);
    font: var(--font-ui);
  }
  .shell {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--gap-3);
    padding: 0 var(--gap-3);
    height: var(--topbar-h);
    border-bottom: 1px solid var(--line);
    background: var(--bg-raised);
  }
  /*
   * The wordmark carries its own hierarchy now that there is no accent hue to
   * spend on it: "Lego" is secondary text, "Studio" is foreground at 600.
   */
  .brand {
    color: var(--fg-dim);
    font-weight: 500;
    letter-spacing: -0.01em;
  }
  .brand span { color: var(--fg); font-weight: 600; }
  .meta {
    color: var(--fg-faint);
    font-variant-numeric: tabular-nums;
  }
  .spacer { flex: 1; }
  /*
   * Two grades of bad news, separated without a hue. A notice is a bordered
   * chip sitting on the page plane: present, quiet, ignorable. A parse
   * failure inverts, which is the loudest thing this shell can say and the
   * only element in the topbar that fills at all, so it cannot be read as
   * ordinary chrome even out of the corner of an eye.
   */
  .notice {
    padding: 3px var(--gap-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--warn-line);
    background: var(--warn-bg);
    color: var(--warn-fg);
    font-weight: 500;
  }
  .parse-errors {
    padding: 3px var(--gap-2);
    border-radius: var(--radius-sm);
    border: 1px solid var(--fg);
    background: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }
  .grid {
    display: grid;
    grid-template-columns: var(--sidebar-w) 1px minmax(0, 1fr) 1px var(--panel-w);
    min-height: 0;
  }
  /*
   * A one pixel line that takes a seven pixel gesture. The line is the column
   * itself so the layout stays honest about the space it uses; the hit area
   * is a pseudo element hanging three pixels over each neighbour, which is
   * the difference between a handle people can grab and one they hunt for.
   */
  .handle {
    position: relative;
    background: var(--line);
    cursor: col-resize;
    touch-action: none;
    transition: background-color var(--tr);
  }
  .handle::after {
    content: '';
    position: absolute;
    inset: 0 -3px;
    z-index: 2;
  }
  .handle:hover { background: var(--fg-faint); }
  .handle:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 1px;
    z-index: 3;
  }
  .handle.is-dragging { background: var(--fg); }
  /*
   * While a drag is live the whole shell stops selecting text and stops
   * showing any cursor but the resize one, so dragging fast across a label or
   * across the preview frame does not leave a trail of highlighted text.
   */
  .shell.is-resizing { user-select: none; }
  .shell.is-resizing * { cursor: col-resize !important; }
  /*
   * No display declaration here. A rule in the outer tree that targets a host
   * element beats the :host rule inside that element's own shadow root,
   * whatever the specificity, so setting display block from out here silently
   * replaced the display grid both of these blocks set on themselves. The
   * canvas lost its grid rows with it, which left the stage with no definite
   * height and collapsed the preview iframe to the 150px default. Each block
   * owns its own display; the shell only constrains the track.
   */
  lego-studio-sidebar,
  lego-studio-canvas { min-width: 0; min-height: 0; }
  /*
   * No border on either side column any more. The handles are the rules
   * between the tracks, and a border here would draw a second line beside
   * them.
   */
  .panels {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    background: var(--bg-raised);
  }
  .tabs {
    display: flex;
    height: var(--tabs-h);
    border-bottom: 1px solid var(--line);
  }
  .tab {
    flex: 1;
    appearance: none;
    border: 0;
    border-bottom: 2px solid transparent;
    background: none;
    color: var(--fg-dim);
    font: inherit;
    padding: 0 var(--gap-2);
    cursor: pointer;
    transition: color var(--tr), background-color var(--tr), border-color var(--tr);
  }
  .tab:hover { color: var(--fg); background: var(--bg-hover); }
  /* Flush against its neighbours, so the ring is inset rather than offset. */
  .tab:focus-visible { outline: 1px solid var(--fg); outline-offset: -4px; }
  .tab.is-active {
    color: var(--fg);
    font-weight: 500;
    border-bottom-color: var(--accent);
  }
  .tab .badge {
    margin-left: 4px;
    color: var(--fg-faint);
    font-variant-numeric: tabular-nums;
  }
  .panel-body { min-height: 0; overflow: auto; }
  lego-studio-controls,
  lego-studio-actions,
  lego-studio-state,
  lego-studio-hydration { display: block; height: 100%; }
  .empty {
    display: grid;
    place-items: center;
    height: 100%;
    color: var(--fg-dim);
  }
</style>
<div class="shell [[ resizing ? 'is-resizing' : '' ]]">
  <header class="topbar">
    <div class="brand">Lego <span>Studio</span></div>
    <div class="meta">[[ storyCount ]] stories / [[ blockCount ]] blocks</div>
    <div class="spacer"></div>
    <div class="notice" b-if="notice">[[ notice ]]</div>
    <div class="parse-errors" b-if="parseErrors.length" title="[[ parseErrors.join(' | ') ]]">
      [[ parseErrors.length ]] block(s) failed to parse
    </div>
  </header>

  <div class="grid">
    <lego-studio-sidebar
      :manifest="manifest"
      :selected="selectedId"
      :filter="filter"
      @story-pick="selectStory($event.detail)"
      @filter-set="setFilter($event.detail)"></lego-studio-sidebar>

    <div class="handle [[ resizing === 'sidebar' ? 'is-dragging' : '' ]]"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the sidebar"
      aria-valuenow="[[ sidebarW ]]"
      aria-valuemin="180"
      aria-valuemax="520"
      tabindex="0"
      title="Drag to resize, double click to reset"
      @pointerdown="startDrag('sidebar', $event)"
      @dblclick="resetWidth('sidebar')"
      @keydown.left.prevent="nudge('sidebar', -1)"
      @keydown.right.prevent="nudge('sidebar', 1)"></div>

    <lego-studio-canvas
      :story="story"
      :block-info="blockInfo"
      :args="args"
      :render-error="renderError"
      :pending="pending"
      :last-log="lastLog"
      :log-count="logCount"
      :remount-nonce="remountNonce"
      @preview-msg="onPreview($event.detail)"
      @remount="remount()"></lego-studio-canvas>

    <div class="handle [[ resizing === 'panel' ? 'is-dragging' : '' ]]"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the panels"
      aria-valuenow="[[ panelW ]]"
      aria-valuemin="260"
      aria-valuemax="900"
      tabindex="0"
      title="Drag to resize, double click to reset"
      @pointerdown="startDrag('panel', $event)"
      @dblclick="resetWidth('panel')"
      @keydown.left.prevent="nudge('panel', -1)"
      @keydown.right.prevent="nudge('panel', 1)"></div>

    <aside class="panels">
      <div class="tabs" role="tablist">
        <button type="button" class="tab [[ tab === 'controls' ? 'is-active' : '' ]]"
          @click="setTab('controls')">Controls<span class="badge">[[ descriptors.length ]]</span></button>
        <button type="button" class="tab [[ tab === 'actions' ? 'is-active' : '' ]]"
          @click="setTab('actions')">Actions<span class="badge">[[ actions.length ]]</span></button>
        <button type="button" class="tab [[ tab === 'state' ? 'is-active' : '' ]]"
          @click="setTab('state')">State</button>
        <button type="button" class="tab [[ tab === 'hydration' ? 'is-active' : '' ]]"
          @click="setTab('hydration')">Hydration</button>
      </div>
      <div class="panel-body">
        <div class="empty" b-if="!story">No story selected</div>
        <lego-studio-controls
          b-if="story"
          b-show="tab === 'controls'"
          :descriptors="descriptors"
          :state-keys="stateKeys"
          :args="args"
          :story-id="selectedId"
          @args-set="setArgs($event.detail)"
          @args-reset="resetArgs()"></lego-studio-controls>
        <lego-studio-actions
          b-if="story"
          b-show="tab === 'actions'"
          :entries="actions"
          :declared="declaredEmits"
          :fired="fired"
          @log-clear="clearActions()"></lego-studio-actions>
        <lego-studio-state
          b-if="story"
          b-show="tab === 'state'"
          :snapshot="snapshot"
          :live="!pending"></lego-studio-state>
        <!--
          The hydration panel talks to the preview itself, over the same
          postMessage channel, so it takes the story id and a nonce and needs
          nothing else from here. The nonce is the remount counter: a remount
          produces a fresh client render, which is exactly when a comparison
          against the server output is worth running again.
        -->
        <lego-studio-hydration
          b-if="story"
          b-show="tab === 'hydration'"
          :story-id="selectedId"
          :nonce="remountNonce"></lego-studio-hydration>
      </div>
    </aside>
  </div>
</div>
`;

const logic = {
  selectedId: '',
  requestedId: '',
  filter: '',
  tab: 'controls',
  sidebarW: COLUMNS.sidebar.fallback,
  panelW: COLUMNS.panel.fallback,
  // '' when nobody is dragging, otherwise the name of the column being
  // dragged. Declared up front so the reactive set trap forwards writes to it.
  resizing: '',
  notice: '',
  args: {},
  actions: [],
  fired: {},
  snapshot: null,
  renderError: '',
  lastLog: null,
  logCount: 0,
  pending: false,
  remountNonce: 0,
  seq: 0,

  /**
   * The manifest is environment, not UI state: manager.js owns it, puts it on
   * the app's globals, and swaps it wholesale when the dev server says the
   * files on disk changed.
   *
   * Read through a plain method as well as a getter, because a $watch
   * callback must not go through a computed that depends on the same thing
   * the watcher is watching. Both are woken by the same trigger, iterated in
   * the order they last registered their dependency, and that order flips as
   * effects re-collect their deps: the callback can therefore run first and
   * read the computed's previous value. Anything a watcher needs is read
   * from source here; the getters exist for the template, where the
   * dependency graph resolves the ordering correctly.
   */
  manifestNow() {
    const env = Lego.globals.studio;
    return (env && env.manifest) || EMPTY_MANIFEST;
  },
  storyList(manifest) {
    const source = manifest || this.manifestNow();
    const blocks = source.blocks || {};
    const out = [];
    (source.order || []).forEach(tag => {
      const info = blocks[tag];
      if (!info) return;
      (info.stories || []).forEach(story => out.push(story));
    });
    return out;
  },

  get manifest() {
    return this.manifestNow();
  },
  get parseErrors() {
    return this.manifest.errors || [];
  },
  get blockCount() {
    return (this.manifest.order || []).length;
  },
  get stories() {
    return this.storyList(this.manifest);
  },
  get storyCount() {
    return this.stories.length;
  },
  get story() {
    const id = this.selectedId;
    return this.stories.find(s => s.id === id) || null;
  },
  get blockInfo() {
    const story = this.story;
    if (!story) return null;
    return (this.manifest.blocks || {})[story.block] || null;
  },
  get descriptors() {
    const info = this.blockInfo;
    return (info && info.props) || [];
  },
  get stateKeys() {
    const info = this.blockInfo;
    return (info && info.stateKeys) || [];
  },
  get declaredEmits() {
    const info = this.blockInfo;
    return (info && info.emits) || [];
  },

  mounted() {
    const stored = readStore();
    if (stored.tab) this.tab = stored.tab;
    if (typeof stored.filter === 'string') this.filter = stored.filter;

    // Restored before the first paint of the grid, and re-clamped rather than
    // trusted: a width stored on a wide monitor has to survive being reopened
    // on a laptop without pushing the canvas off the side.
    this.restoreWidths(stored);
    this._onResize = () => this.applyWidths(this.sidebarW, this.panelW);
    window.addEventListener('resize', this._onResize);

    this.requestedId = this.readUrlStory();

    // Watches first, then the initial resolve, so the very first selection
    // goes down the same path every later one does.
    this.$watch('manifest', () => this.resolveSelection());
    this.$watch('selectedId', (id, previous) => this.onStoryChanged(id, previous));

    this._onPop = () => {
      this.requestedId = this.readUrlStory();
      this.selectedId = '';
      this.resolveSelection();
    };
    window.addEventListener('popstate', this._onPop);

    this.resolveSelection();
  },

  unmounted() {
    if (this._onPop) window.removeEventListener('popstate', this._onPop);
    if (this._onResize) window.removeEventListener('resize', this._onResize);
  },

  /* ---------------------------------------------------------------- *
   * Column widths
   * ---------------------------------------------------------------- */

  /**
   * The shell's own width. The host fills the page, so its box is the space
   * the three tracks and two handles divide up between them.
   */
  shellWidth() {
    const box = this.$element.getBoundingClientRect();
    return box.width || window.innerWidth || 0;
  },

  /**
   * Clamp one column against its own range and against what the other column
   * has left over.
   *
   * The canvas floor is enforced here rather than in the grid, because a grid
   * minimum would make the tracks overflow the shell instead of refusing the
   * drag, and a preview that has slid off the right of the window is worse
   * than one that stopped getting narrower.
   */
  fitWidth(name, wanted, otherWidth) {
    const spec = COLUMNS[name];
    const total = this.shellWidth();
    const ceiling = total
      ? Math.min(spec.max, total - otherWidth - (HANDLE_W * 2) - CANVAS_FLOOR)
      : spec.max;
    // A window too narrow to satisfy everyone still has to answer something,
    // and the column's own minimum is the least bad answer.
    return Math.round(clamp(wanted, spec.min, Math.max(spec.min, ceiling)));
  },

  /**
   * Write both widths onto the host as custom properties.
   *
   * The grid already reads `--sidebar-w` and `--panel-w`, and manager.css
   * declares their defaults on :root, so setting them on this element is all
   * it takes for the layout to follow with no rewrite. Each is clamped
   * against the other's current value, in the order that lets the column
   * being dragged win.
   */
  applyWidths(sidebar, panel, lead = 'sidebar') {
    let nextSidebar = sidebar;
    let nextPanel = panel;
    if (lead === 'sidebar') {
      nextSidebar = this.fitWidth('sidebar', sidebar, nextPanel);
      nextPanel = this.fitWidth('panel', panel, nextSidebar);
    } else {
      nextPanel = this.fitWidth('panel', panel, nextSidebar);
      nextSidebar = this.fitWidth('sidebar', sidebar, nextPanel);
    }
    this.sidebarW = nextSidebar;
    this.panelW = nextPanel;
    this.$element.style.setProperty('--sidebar-w', `${nextSidebar}px`);
    this.$element.style.setProperty('--panel-w', `${nextPanel}px`);
    return { sidebar: nextSidebar, panel: nextPanel };
  },

  restoreWidths(stored) {
    const source = stored || readStore();
    const sidebar = Number(source[COLUMNS.sidebar.key]);
    const panel = Number(source[COLUMNS.panel.key]);
    this.applyWidths(
      Number.isFinite(sidebar) ? sidebar : COLUMNS.sidebar.fallback,
      Number.isFinite(panel) ? panel : COLUMNS.panel.fallback
    );
  },

  saveWidths() {
    writeStore({
      [COLUMNS.sidebar.key]: this.sidebarW,
      [COLUMNS.panel.key]: this.panelW
    });
  },

  /** The width `name` would have if its handle sat at viewport x. */
  widthFromPointer(name, clientX) {
    const box = this.$element.getBoundingClientRect();
    return name === 'sidebar'
      ? clientX - box.left
      : box.right - clientX;
  },

  setWidth(name, wanted) {
    if (name === 'sidebar') this.applyWidths(wanted, this.panelW, 'sidebar');
    else this.applyWidths(this.sidebarW, wanted, 'panel');
  },

  /**
   * Start a drag.
   *
   * Pointer capture is the whole point of using pointer events here. The
   * canvas holds a cross document iframe, and without capture the first
   * pointermove that lands over it goes to that document instead and the
   * gesture dies mid drag. Capturing on the handle keeps every move coming
   * back here however fast the pointer crosses the preview.
   */
  startDrag(name, event) {
    if (!COLUMNS[name] || event.button !== 0) return;
    const handle = event.currentTarget;
    event.preventDefault();
    this.resizing = name;

    try {
      handle.setPointerCapture(event.pointerId);
    } catch (e) {
      /* a browser without capture still gets the move events, just fragilely */
    }

    const onMove = (moveEvent) => {
      this.setWidth(name, this.widthFromPointer(name, moveEvent.clientX));
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      try {
        handle.releasePointerCapture(event.pointerId);
      } catch (e) {
        /* already released, which is the normal case on pointercancel */
      }
      this.resizing = '';
      this.saveWidths();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  },

  /**
   * One arrow key press, in the direction the handle visibly moves.
   *
   * Right on the sidebar handle widens the sidebar; right on the panel handle
   * narrows the panels. Both send the line to the right, which is the only
   * thing somebody pressing the key is thinking about.
   */
  nudge(name, direction) {
    const step = KEY_STEP * direction * (name === 'sidebar' ? 1 : -1);
    this.setWidth(name, (name === 'sidebar' ? this.sidebarW : this.panelW) + step);
    this.saveWidths();
  },

  resetWidth(name) {
    this.setWidth(name, COLUMNS[name].fallback);
    this.saveWidths();
  },

  readUrlStory() {
    try {
      return new URLSearchParams(window.location.search).get('story') || '';
    } catch (e) {
      return '';
    }
  },

  /**
   * Decide which story is showing. An id that no longer exists (a renamed
   * story, a stale bookmark, a block that just lost its .lego file) falls
   * back to the first story and says so, rather than showing an empty canvas
   * and leaving the reader to guess.
   */
  resolveSelection() {
    const manifest = this.manifestNow();
    const stories = this.storyList(manifest);
    if (stories.length === 0) {
      this.notice = (manifest.errors || []).length ? 'No blocks discovered.' : '';
      this.selectedId = '';
      return;
    }
    const wanted = this.selectedId || this.requestedId;
    const found = stories.find(s => s.id === wanted);
    if (found) {
      this.notice = '';
      this.requestedId = '';
      if (this.selectedId !== found.id) this.selectedId = found.id;
      return;
    }
    this.notice = wanted
      ? `Unknown story "${wanted}". Showing ${stories[0].name} instead.`
      : '';
    this.requestedId = '';
    this.selectedId = stories[0].id;
  },

  /**
   * A story change resets the args to what the story declares. The action log
   * only clears when the *block* changes, because staying inside one block is
   * the case the canvas deliberately does not reload the iframe for, and
   * throwing the log away would defeat that.
   */
  onStoryChanged(id, previous) {
    const story = this.storyList().find(s => s.id === id) || null;
    // The story that just left may no longer be in the manifest at all (it
    // could be why the selection moved), so its block comes off the id, which
    // contracts.js guarantees is `${block}--${slug(name)}`.
    const previousBlock = previous ? String(previous).split('--')[0] : '';
    const nextBlock = story ? story.block : '';

    this.args = story ? (serialisable(story.args) || {}) : {};
    this.snapshot = null;
    this.renderError = '';
    this.pending = !!story;
    if (previousBlock !== nextBlock) {
      this.actions = [];
      this.fired = {};
      this.lastLog = null;
      this.logCount = 0;
    }
    this.writeUrl();
  },

  writeUrl() {
    try {
      const url = new URL(window.location.href);
      if (this.selectedId) url.searchParams.set('story', this.selectedId);
      else url.searchParams.delete('story');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    } catch (e) {
      /* deep links are a nicety too */
    }
  },

  selectStory(id) {
    if (!id || id === this.selectedId) return;
    this.selectedId = id;
  },

  setFilter(value) {
    const next = String(value || '');
    if (next === this.filter) return;
    this.filter = next;
    writeStore({ filter: next });
  },

  setTab(tab) {
    if (tab === this.tab) return;
    this.tab = tab;
    writeStore({ tab });
  },

  setArgs(args) {
    this.args = args || {};
    this.pending = true;
  },

  /**
   * Reset restores the story's declared args and remounts. Args go first so
   * the remount happens against the values that were just restored.
   */
  resetArgs() {
    const story = this.story;
    this.args = story ? (serialisable(story.args) || {}) : {};
    this.remount();
  },

  remount() {
    this.pending = true;
    this.renderError = '';
    this.remountNonce = this.remountNonce + 1;
  },

  clearActions() {
    this.actions = [];
  },

  onPreview(message) {
    if (!message || !message.type) return;
    const kind = message.type.replace('lego-studio:', '');

    if (kind === 'ready') {
      this.pending = true;
      return;
    }
    if (kind === 'rendered') {
      this.pending = false;
      this.renderError = message.error ? String(message.error) : '';
      return;
    }
    if (kind === 'state') {
      this.pending = false;
      this.snapshot = message.state === undefined ? null : message.state;
      return;
    }
    if (kind === 'action') {
      this.pushAction(message);
      return;
    }
    if (kind === 'log') {
      this.logCount = this.logCount + 1;
      this.lastLog = { level: String(message.level || 'log'), text: String(message.text || '') };
    }
  },

  pushAction(message) {
    this.seq = this.seq + 1;
    const name = String(message.name || 'event');
    const entry = {
      id: `a${this.seq}`,
      name,
      at: Number(message.time) || Date.now(),
      detail: message.detail === undefined ? null : message.detail
    };
    this.actions = [entry].concat(this.actions).slice(0, MAX_ACTIONS);
    if (!this.fired[name]) this.fired = Object.assign({}, this.fired, { [name]: true });
  }
};

Lego.block('lego-studio-shell', { template, logic });
