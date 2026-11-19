/**
 * What the hydration panel decides, with no DOM in the way.
 *
 * Same split as controls-model.js and viewport-model.js: the block owns the
 * template and the rendering, and everything that is transport or arithmetic
 * lives here where a test can reach it without a browser.
 *
 * That mattered more here than anywhere else in the studio. The panel shipped
 * with a race in exactly this code, comparing one story's server HTML against
 * the previously mounted story's DOM, and it was invisible because both
 * halves answered promptly and successfully. Every gate that closes it is
 * below, and every gate has a test.
 */

import { PROTOCOL } from '../../core/contracts.js';
import { SSR_ROUTE, SSR_STATIC_DIR } from '../../hydrate/plugin.js';
import { compareRenders, normaliseHTML } from '../../hydrate/compare.js';

/** How long to wait for the preview to answer a SERIALIZE. */
export const SERIALIZE_TIMEOUT = 4000;

/**
 * How long to wait for a PROTOCOL.RENDERED before asking anyway.
 *
 * Short, because this is only the path where no RENDERED is coming at all:
 * the panel opened after the preview had already finished the story, or a
 * message went missing. Every layer below checks the story id, so an early
 * ask costs a retry rather than a wrong answer.
 */
export const RENDER_GRACE = 600;

/* ------------------------------------------------------------------ *
 * Fetching the server half
 * ------------------------------------------------------------------ */

/**
 * Where the server render might be, most specific first.
 *
 * The dev server answers the first. The other two are what a static build
 * leaves on disk, tried both from the site root and from one directory down,
 * because the built manager lives at `manager/index.html` and a static host
 * has no rewrite to hide that.
 *
 * @param {string} storyId
 * @returns {string[]}
 */
export const ssrCandidates = (storyId) => {
  const id = encodeURIComponent(String(storyId));
  return [
    `${SSR_ROUTE}?story=${id}`,
    `${SSR_STATIC_DIR}/${id}.json`,
    `../${SSR_STATIC_DIR}/${id}.json`
  ];
};

/**
 * Ask each candidate in turn for `{ html, error }`.
 *
 * A JSON body is the answer whatever the status code says: the dev route
 * reports an unknown story as a 404 carrying a perfectly good explanation,
 * and refusing to read it would replace a useful message with a useless one.
 * A response that is not JSON is a wrong guess about where the endpoint
 * lives, so the next candidate gets a turn.
 *
 * @param {string} storyId
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] - injected for tests
 * @returns {Promise<{html: string, error: ?string}>}
 */
export async function fetchServerHTML(storyId, options = {}) {
  const call = options.fetchImpl || ((url) => fetch(url, { headers: { accept: 'application/json' } }));
  let last = null;

  for (const url of ssrCandidates(storyId)) {
    let body = null;
    try {
      const response = await call(url);
      body = await response.json();
    } catch (err) {
      last = `${url}: ${err && err.message ? err.message : String(err)}`;
      continue;
    }
    if (body && (typeof body.html === 'string' || typeof body.error === 'string')) {
      return { html: body.html || '', error: body.error || null };
    }
    last = `${url} did not answer with { html, error }.`;
  }

  return { html: '', error: last || 'No server render endpoint answered.' };
}

/* ------------------------------------------------------------------ *
 * Asking the preview for the client half
 * ------------------------------------------------------------------ */

/**
 * A one-way latch on the preview window plus a request/response pair over it.
 *
 * The preview posts every message to `window.parent`, which is this document,
 * so the source of any `lego-studio:` message is the window to send
 * PROTOCOL.SERIALIZE back to. Learning it that way rather than by looking for
 * an iframe keeps this panel out of the canvas block's shadow root, which is
 * the one place the manager's transport is allowed to live.
 *
 * @param {Window} win - the window to listen on
 * @returns {{request: (storyId: string, timeout?: number) => Promise<object>, target: () => ?Window, stop: () => void}}
 */
export function createPreviewChannel(win) {
  let target = null;
  let pending = null;
  let pendingStoryId = null;
  const renderedListeners = new Set();

  const onMessage = (event) => {
    const data = event.data;
    if (!data || typeof data.type !== 'string' || data.type.indexOf('lego-studio:') !== 0) return;
    if (event.source && event.source !== win) target = event.source;
    if (data.type === PROTOCOL.RENDERED) {
      renderedListeners.forEach(fn => fn(data));
      return;
    }
    if (data.type !== PROTOCOL.SERIALIZED || !pending) return;
    // An answer about a different story is the preview telling us it had not
    // caught up yet. It is not a result, and it must never reach the differ:
    // comparing this story's server HTML against the last one's DOM is how
    // the panel used to report differences that were really just a race. The
    // retry loop below is still running, so this is a miss, not a failure.
    if (pendingStoryId && data.storyId && data.storyId !== pendingStoryId) return;
    const settle = pending;
    pending = null;
    settle({
      html: typeof data.html === 'string' ? data.html : '',
      error: data.error || null,
      storyId: data.storyId || null
    });
  };

  win.addEventListener('message', onMessage);

  const request = (storyId, timeout = SERIALIZE_TIMEOUT) => new Promise((resolve) => {
    const started = Date.now();
    let timer = 0;
    let done = false;

    const finish = (answer) => {
      if (done) return;
      done = true;
      if (timer) win.clearInterval(timer);
      timer = 0;
      if (pending === finish) pending = null;
      resolve(answer);
    };

    // An earlier request still waiting is abandoned rather than left
    // registered, where it would catch this one's reply and answer the wrong
    // question.
    if (pending) pending({ html: '', error: 'Superseded by a newer request.', storyId: null });
    pending = finish;
    pendingStoryId = storyId || null;

    // Retried on an interval because the preview may not have spoken yet,
    // and until it has there is no window to send to.
    const attempt = () => {
      if (done) return;
      if (target) target.postMessage({ type: PROTOCOL.SERIALIZE, storyId }, '*');
      if (Date.now() - started < timeout) return;
      finish({
        html: '',
        storyId: null,
        error: target
          ? `The preview did not answer for ${storyId} within ${timeout}ms.`
          : 'The preview frame has not reported in yet, so there is nothing to ask.'
      });
    };

    attempt();
    timer = win.setInterval(attempt, 250);
  });

  /**
   * Subscribe to the preview finishing a render.
   *
   * The panel used to compare as soon as its `storyId` prop changed, which is
   * the moment the person clicked, not the moment the preview had anything
   * new to show. Driving from RENDERED means the client half is asked for
   * only once it exists.
   */
  const onRendered = (fn) => {
    renderedListeners.add(fn);
    return () => renderedListeners.delete(fn);
  };

  return {
    request,
    onRendered,
    target: () => target,
    stop: () => win.removeEventListener('message', onMessage)
  };
}

/**
 * The listener starts at import, not at mount. The preview announces itself
 * once, with READY, and a panel that only starts listening when a person
 * opens it would have missed that and have nowhere to send its request.
 */
export const channel = typeof window === 'undefined' ? null : createPreviewChannel(window);

/* ------------------------------------------------------------------ *
 * Comparing
 * ------------------------------------------------------------------ */

/**
 * Everything the panel does, with both transports handed in. Kept out of the
 * block so it can be exercised without a manager, an iframe or a dev server.
 *
 * @param {string} storyId
 * @param {object} deps
 * @param {() => Promise<{html: string, error: ?string}>} deps.server
 * @param {() => Promise<{html: string, error: ?string}>} deps.client
 * @returns {Promise<object>} the panel's next state
 */
export async function runComparison(storyId, deps) {
  const [server, client] = await Promise.all([deps.server(), deps.client()]);

  // Belt as well as braces. The channel already drops a reply about another
  // story, and the preview already refuses to serialise one it was not asked
  // for, but this is the last gate before two documents' markup is declared
  // comparable, and being wrong here is indistinguishable from a real
  // divergence. A mismatch is a miss, not a difference.
  if (client.storyId && storyId && client.storyId !== storyId) {
    return {
      phase: 'waiting',
      message: `The preview has ${client.storyId} mounted, not ${storyId}. Waiting for it to catch up.`,
      serverHTML: '',
      clientHTML: '',
      diff: '',
      differences: []
    };
  }

  if (server.error || client.error) {
    return {
      phase: 'error',
      message: [server.error, client.error].filter(Boolean).join('\n'),
      serverHTML: server.html ? normaliseHTML(server.html) : '',
      clientHTML: client.html ? normaliseHTML(client.html) : '',
      diff: '',
      differences: []
    };
  }

  const result = compareRenders(server.html, client.html);
  return {
    phase: result.equal ? 'match' : 'diverged',
    message: result.equal
      ? `Server and client agree on ${storyId}.`
      : `${result.differences.length} difference${result.differences.length === 1 ? '' : 's'} between the server render and the mounted DOM.`,
    serverHTML: normaliseHTML(server.html),
    clientHTML: normaliseHTML(client.html),
    diff: result.diff,
    differences: result.differences
  };
}

/** One diff line, tagged with what it is, so the row can colour it. */
export const diffRows = (diff) => {
  const text = String(diff || '');
  if (!text) return [];
  return text.split('\n').map((line, index) => ({
    id: index,
    text: line,
    kind: line.startsWith('@@') ? 'hunk'
      : line.startsWith('+') ? 'ins'
        : line.startsWith('-') ? 'del' : 'eq'
  }));
};

/**
 * The same diff as two columns.
 *
 * A unified diff already carries everything a side by side view needs: within
 * one hunk the removals are the left column and the additions are the right,
 * in order, and a context line is both. So this is a regrouping rather than a
 * second diff, which is why it is worth having at all: there is no second
 * algorithm here to disagree with the first.
 */
export const splitRows = (rows) => {
  const out = [];
  let removed = [];
  let added = [];

  const flush = () => {
    const span = Math.max(removed.length, added.length);
    for (let at = 0; at < span; at++) {
      out.push({
        id: `p${out.length}`,
        left: removed[at] === undefined ? null : removed[at],
        right: added[at] === undefined ? null : added[at],
        kind: 'change'
      });
    }
    removed = [];
    added = [];
  };

  for (const row of rows) {
    if (row.kind === 'del') {
      removed.push(row.text.slice(1));
      continue;
    }
    if (row.kind === 'ins') {
      added.push(row.text.slice(1));
      continue;
    }
    flush();
    if (row.kind === 'hunk') {
      out.push({ id: `p${out.length}`, left: row.text, right: row.text, kind: 'hunk' });
      continue;
    }
    out.push({ id: `p${out.length}`, left: row.text.slice(1), right: row.text.slice(1), kind: 'eq' });
  }
  flush();
  return out;
};
