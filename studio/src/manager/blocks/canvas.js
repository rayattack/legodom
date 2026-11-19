/**
 * lego-studio-canvas: the preview iframe and its toolbar.
 *
 * This block owns the whole manager side of PROTOCOL, because it owns the
 * iframe. Nothing else in the manager touches `contentWindow`, and nothing
 * anywhere touches the document inside it. Messages arriving from the frame
 * are re-emitted as one `preview-msg` event for the shell to interpret; the
 * commands going the other way are driven by prop changes the shell makes.
 *
 * The reload rule matters more than it looks. A story change inside the same
 * block is a re-render, not a new document: reloading would restart the
 * preview runtime and throw away everything the developer had built up. So
 * the iframe navigates only when the block changes, and every other change
 * goes over postMessage.
 */

import { Lego } from 'lego-dom';
import { PROTOCOL, serialisable } from '../../core/contracts.js';
// Imported for its side effect: the tag has to be registered before this
// block mounts, or the nested snap pass walks straight past the element the
// toolbar puts in the DOM.
import './viewport.js';

const previewSrc = (storyId) => `/preview?story=${encodeURIComponent(storyId)}`;

const template = `
<style>
  :host {
    display: grid;
    grid-template-rows: var(--tabs-h) minmax(0, 1fr) auto;
    height: 100%;
    background: var(--bg-canvas);
    color: var(--fg);
    font: var(--font-ui);
  }
  .toolbar {
    display: flex;
    align-items: center;
    gap: var(--gap-2);
    padding: 0 var(--gap-3);
    border-bottom: 1px solid var(--line);
    background: var(--bg-raised);
  }
  .crumb {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }
  .crumb .tag {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--fg-dim);
  }
  .crumb .sep { color: var(--fg-faint); }
  .crumb .name { color: var(--fg); font-weight: 500; }
  .crumb .src {
    color: var(--fg-faint);
    font-size: var(--fs-xs);
  }
  .spacer { flex: 1; }
  /*
   * Where lego-studio-viewport sits. It belongs next to the frame rather than
   * in a panel because both things it decides are about the frame, and it is
   * the canvas that owns the transport into it. No display declaration on the
   * element itself: a rule out here beats the :host rule inside its own
   * shadow root, which is the trap the comment above .grid in shell.js is
   * about.
   */
  .toolbar-slot {
    display: flex;
    align-items: center;
    gap: var(--gap-2);
    min-width: 0;
  }
  /*
   * A hairline and a fill one step off the bar. There is no primary button
   * anywhere in this manager, so hover is the border going to full strength
   * rather than a wash of colour arriving.
   */
  .btn {
    appearance: none;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    background: var(--bg-input);
    color: var(--fg-dim);
    font: inherit;
    padding: 3px var(--gap-2);
    cursor: pointer;
    text-decoration: none;
    transition: color var(--tr), border-color var(--tr);
  }
  .btn:hover { color: var(--fg); border-color: var(--accent); }
  .btn:focus-visible {
    outline: 1px solid var(--fg);
    outline-offset: 2px;
    border-color: var(--fg);
  }
  .stage {
    position: relative;
    min-height: 0;
    overflow: auto;
    background:
      repeating-conic-gradient(var(--grid) 0% 25%, transparent 0% 50%) 50% / 16px 16px;
  }
  /*
   * Width and height are assigned from the viewport picker rather than bound,
   * for the same reason src is: see syncFrame below. The auto margins do
   * nothing at full width and centre the frame the moment a preset narrows
   * it, which is when the checkerboard behind it starts being visible at all.
   */
  iframe {
    display: block;
    width: 100%;
    height: 100%;
    margin: 0 auto;
    border: 0;
    background: var(--bg-stage);
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    align-content: start;
    gap: var(--gap-2);
    padding: var(--gap-4);
    overflow: auto;
    background: var(--bad-scrim);
    backdrop-filter: blur(2px);
  }
  /*
   * The heading inverts. This overlay covers the story the developer was
   * looking at, so it is the one thing in the manager allowed to shout, and
   * with no red available the only way left to shout is to swap foreground
   * and background. The trace under it keeps the full strength hairline that
   * marks every failure surface here.
   */
  .overlay h2 {
    justify-self: start;
    margin: 0;
    padding: 3px var(--gap-2);
    border-radius: var(--radius-sm);
    background: var(--fg);
    color: var(--bg);
    font-size: var(--fs-xs);
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .overlay pre {
    margin: 0;
    padding: var(--gap-3);
    border: 1px solid var(--bad-line);
    border-radius: var(--radius);
    background: var(--bad-bg);
    color: var(--bad-fg);
    font: var(--font-code);
    white-space: pre-wrap;
    overflow-x: auto;
  }
  .pending {
    position: absolute;
    top: var(--gap-2);
    right: var(--gap-2);
    padding: 1px var(--gap-2);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    background: var(--accent-bg);
    color: var(--fg-dim);
    font-size: var(--fs-xs);
  }
  .console {
    display: flex;
    align-items: center;
    gap: var(--gap-2);
    border-top: 1px solid var(--line);
    background: var(--bg-raised);
    padding: 4px var(--gap-3);
    font: var(--font-code);
    color: var(--fg-dim);
  }
  /*
   * The level was the whole signal when it could be red. Now it is a chip:
   * bare text for a log line, an outlined chip for a warning, a filled and
   * inverted one for an error, so the three grades are three shapes and the
   * text beside them gains weight to match.
   */
  .console .level {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 0.06em;
    color: var(--fg-faint);
  }
  .console.is-warn { border-top-color: var(--warn-line); }
  .console.is-warn .level {
    padding: 0 5px;
    border: 1px solid var(--warn-line);
    border-radius: var(--radius-sm);
    color: var(--warn-fg);
    font-weight: 500;
  }
  .console.is-warn .text { color: var(--warn-fg); }
  .console.is-error { border-top-color: var(--bad-line); }
  .console.is-error .level {
    padding: 0 5px;
    border-radius: var(--radius-sm);
    background: var(--fg);
    color: var(--bg);
    font-weight: 600;
  }
  .console.is-error .text { color: var(--bad-fg); font-weight: 500; }
  .console .text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .console .count { color: var(--fg-faint); font-variant-numeric: tabular-nums; }
</style>
<div class="toolbar">
  <div class="crumb">
    <span class="tag">[[ blockTag ]]</span>
    <span class="sep">/</span>
    <span class="name">[[ storyName ]]</span>
    <span class="src" b-if="storySource">([[ storySource ]])</span>
  </div>
  <div class="spacer"></div>
  <div class="toolbar-slot" data-studio-slot="viewport-theme">
    <lego-studio-viewport
      @theme-change="onTheme($event.detail)"
      @viewport-change="onViewportPick($event.detail)"></lego-studio-viewport>
  </div>
  <button type="button" class="btn" @click="$emit('remount')" title="Unmount and mount the block again">Remount</button>
  <a class="btn" href="[[ previewHref ]]" target="_blank" rel="noopener noreferrer">Open frame</a>
</div>
<div class="stage">
  <iframe b-var="frame" title="Story preview"></iframe>
  <div class="pending" b-if="pending">rendering</div>
  <div class="overlay" b-if="renderError">
    <h2>Render failed</h2>
    <pre>[[ renderError ]]</pre>
  </div>
</div>
<!--
  Optional chaining is not decoration. b-if is not a terminal directive, so
  the interpolations inside a subtree it has swapped out still evaluate on
  every render; reading lastLog.level while lastLog is null throws into the
  block's error boundary rather than rendering nothing.
-->
<div class="console [[ logClass ]]" b-if="lastLog">
  <span class="level">[[ lastLog?.level ]]</span>
  <span class="text">[[ lastLog?.text ]]</span>
  <span class="count">[[ logCount ]]</span>
</div>
`;

const logic = {
  ready: false,
  frameSrc: '',
  frameBlock: '',
  // What the preview was last told, so a reload can be told the same thing.
  previewTheme: 'light',

  get blockTag() {
    const story = this.story;
    return story ? story.block : 'no block';
  },
  get storyName() {
    const story = this.story;
    return story ? story.name : 'no story';
  },
  get storySource() {
    const story = this.story;
    return story && story.source !== 'implicit' ? story.source : '';
  },
  get previewHref() {
    const story = this.story;
    return story ? previewSrc(story.id) : '/preview';
  },
  get logClass() {
    const log = this.lastLog;
    if (!log) return '';
    if (log.level === 'error') return 'is-error';
    if (log.level === 'warn') return 'is-warn';
    return '';
  },

  mounted() {
    this._onMessage = (event) => {
      const frame = this.$vars.frame;
      if (!frame || !frame.contentWindow || event.source !== frame.contentWindow) return;
      const data = event.data;
      if (!data || typeof data.type !== 'string' || data.type.indexOf('lego-studio:') !== 0) return;
      if (data.type === PROTOCOL.READY) {
        this.ready = true;
        // Theme before story, so a dark preview does not flash white on its
        // way in. The iframe navigates whenever the block changes and a fresh
        // document starts at its own default, so this has to be re-sent on
        // every boot rather than only when the picker is used.
        this.sendTheme();
        this.sendRender();
      }
      this.$emit('preview-msg', data);
    };
    window.addEventListener('message', this._onMessage);

    this.$watch('story', () => this.syncFrame());
    this.$watch('args', (args) => {
      if (!this.ready) return;
      this.post(PROTOCOL.ARGS, { args: serialisable(args) || {} });
    });
    this.$watch('remountNonce', () => {
      if (!this.ready) return;
      this.post(PROTOCOL.REMOUNT, {});
      // A remount rebuilds the block from the story the preview last
      // received, so any edited args have to be replayed or the panel and
      // the frame quietly disagree.
      const args = serialisable(this.args) || {};
      if (Object.keys(args).length > 0) this.post(PROTOCOL.ARGS, { args });
    });

    this.syncFrame();
  },

  unmounted() {
    if (this._onMessage) window.removeEventListener('message', this._onMessage);
  },

  /**
   * Point the frame at a story, navigating only when the block changed.
   *
   * The src is assigned rather than bound. An interpolated `src` attribute is
   * present in the cloned template before the first render runs, so the
   * browser would fire one request for the literal text "[[ frameSrc ]]"
   * before the real URL ever lands. There is no declarative way to say
   * "this attribute does not exist yet", so this one goes through the element
   * reference.
   */
  syncFrame() {
    const frame = this.$vars.frame;
    const story = this.story;
    if (!frame) return;
    if (!story) {
      this.ready = false;
      this.frameBlock = '';
      this.frameSrc = '';
      frame.removeAttribute('src');
      return;
    }
    if (this.frameSrc && this.frameBlock === story.block) {
      this.sendRender();
      return;
    }
    this.ready = false;
    this.frameBlock = story.block;
    this.frameSrc = previewSrc(story.id);
    frame.src = this.frameSrc;
  },

  /**
   * The picked theme, translated for the frame.
   *
   * The manager and the preview do not mean the same thing by a theme. The
   * manager is chrome: it is ours, and following the operating system is the
   * right default for it, which is what "system" leaves it doing. The preview
   * is content: its background is part of what the developer is inspecting,
   * so an operating system setting must never repaint it. "System" therefore
   * means light in the frame, and dark is only ever an explicit choice.
   *
   * That is why this reads detail.theme and not detail.resolved. resolved is
   * the manager's answer, and it is the wrong answer for the frame.
   */
  onTheme(detail) {
    this.previewTheme = detail && detail.theme === 'dark' ? 'dark' : 'light';
    this.sendTheme();
  },

  sendTheme() {
    if (!this.ready) return;
    // No background in the payload, so the runtime clears any override it was
    // holding and the preview document's own stylesheet stays in charge.
    this.post(PROTOCOL.THEME, { theme: this.previewTheme });
  },

  /**
   * A size for the frame. Assigned rather than bound for the same reason the
   * src is, and null width means "take the stage", which is the responsive
   * entry rather than a missing value.
   */
  onViewportPick(size) {
    const frame = this.$vars.frame;
    if (!frame) return;
    frame.style.width = size && size.width ? `${size.width}px` : '100%';
    frame.style.height = size && size.height ? `${size.height}px` : '100%';
  },

  sendRender() {
    const story = this.story;
    if (!story || !this.ready) return;
    this.post(PROTOCOL.RENDER, { story: serialisable(story) });
    const args = serialisable(this.args) || {};
    if (Object.keys(args).length > 0) this.post(PROTOCOL.ARGS, { args });
  },

  post(type, payload) {
    const frame = this.$vars.frame;
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage(Object.assign({ type }, payload), '*');
  }
};

Lego.block('lego-studio-canvas', {
  template,
  logic,
  props: [
    'story: Object = null',
    'blockInfo: Object = null',
    'args: Object = {}',
    'renderError: String = ""',
    'pending: Boolean = false',
    'lastLog: Object = null',
    'logCount: Number = 0',
    'remountNonce: Number = 0'
  ].join(', ')
});
