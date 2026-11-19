import legoSource from '../../../dist/lego.min.js?raw';
import runtimeSource from './sandbox-runtime.js?raw';

// A closing script tag inside inlined source would end the element early.
const inlineScript = (code) => code.replace(/<\/script/gi, '<\\/script');
const inlineJSON = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const PAGE_STYLE = `
  :root { color-scheme: light; }
  html, body { margin: 0; }
  body {
    padding: 20px;
    font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    font-size: 15px;
    line-height: 1.5;
    color: #14161f;
    background: #ffffff;
  }
  button, input, select, textarea { font: inherit; }
`;

/**
 * Build the document for one run of a project. The page is always light: it
 * is the learner's page, not part of this site, and the lesson styles are
 * written for a white sheet.
 */
export function buildSandboxDocument({ files, storage = {}, token }) {
  return [
    '<!doctype html><html><head><meta charset="utf-8">',
    `<style>${PAGE_STYLE}</style>`,
    `<script>window.__LEGO_PROJECT__=${inlineJSON({ files, storage, token })}</script>`,
    `<script>${inlineScript(runtimeSource)}</script>`,
    `<script>${inlineScript(legoSource)}</script>`,
    '</head><body>',
    '<script>__legoSandbox.boot()</script>',
    '</body></html>'
  ].join('');
}

/**
 * Runs projects in a sandboxed iframe inside `stage`.
 *
 * Two frames at most: the one on screen and the one still booting. The new
 * frame replaces the old only once it reports ready, so typing never flashes
 * an empty preview.
 */
export function createPreview(stage, handlers = {}) {
  let current = null;
  let pending = null;
  let storage = {};
  let sequence = 0;
  let fallback = null;
  const emit = (name, payload) => handlers[name] && handlers[name](payload);

  const promote = (frame) => {
    if (pending !== frame) return;
    clearTimeout(fallback);
    if (current) current.remove();
    current = pending;
    pending = null;
    current.classList.remove('is-pending');
  };

  const onMessage = (event) => {
    const msg = event.data;
    if (!msg || msg.source !== 'lego-sandbox') return;
    const frame = pending || current;
    if (!frame || event.source !== frame.contentWindow || msg.token !== frame.dataset.token) return;
    if (msg.type === 'ready') { promote(frame); emit('ready'); }
    else if (msg.type === 'console') emit('console', { level: msg.level, text: msg.text });
    else if (msg.type === 'error') { promote(frame); emit('error', { message: msg.message, where: msg.where }); }
    else if (msg.type === 'state') emit('state', msg.blocks);
    else if (msg.type === 'storage') storage = msg.data || {};
  };
  window.addEventListener('message', onMessage);

  return {
    run(files) {
      const token = `run-${++sequence}`;
      const frame = document.createElement('iframe');
      // No allow-same-origin: the code in here is whatever was typed or
      // shared, and it gets an opaque origin with no reach into this site.
      frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals allow-popups');
      frame.setAttribute('title', 'Live preview');
      frame.className = current ? 'lg-frame is-pending' : 'lg-frame';
      frame.dataset.token = token;
      frame.srcdoc = buildSandboxDocument({ files, storage, token });
      if (pending) pending.remove();
      pending = frame;
      emit('start');
      stage.appendChild(frame);
      clearTimeout(fallback);
      fallback = setTimeout(() => promote(frame), 1500);
    },
    clearStorage() { storage = {}; },
    destroy() {
      window.removeEventListener('message', onMessage);
      clearTimeout(fallback);
      if (current) current.remove();
      if (pending) pending.remove();
    }
  };
}
