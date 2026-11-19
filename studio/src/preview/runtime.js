/**
 * The preview runtime.
 *
 * This module owns the isolation boundary. It runs inside an iframe, in its own
 * realm, with its own document and its own `window.Lego`. That matters more
 * than it sounds: a block declaring `b-shadow="false"` injects its scoped
 * <style> into `document.head`, so a preview mounted inside the manager's
 * shadow root could never see its own CSS. Here the head is the preview's own.
 * The same boundary keeps a previewed block's writes to globals, to the router
 * and to localStorage out of the manager.
 *
 * The manager and this file exchange nothing but the messages in PROTOCOL.
 */

import { Lego } from 'lego-dom';
import manifest from 'virtual:lego-studio/manifest';
import 'virtual:lego-studio/blocks';
import { PROTOCOL, serialisable } from '../core/contracts.js';

const mountRoot = document.getElementById('lego-studio-root');

/**
 * Vite serves a virtual module at `/@id/` with the leading NUL of the resolved
 * id spelled `__x00__`. Re-importing that URL with a fresh query is how the
 * runtime picks up a recomputed manifest without reloading the whole frame.
 */
const virtualUrl = (id) => `/@id/__x00__${id}`;

let currentManifest = manifest;
let current = null;
let lastStory = null;
let ready = false;

const queued = [];
let chain = Promise.resolve();

/* ------------------------------------------------------------------ *
 * Talking to the manager
 * ------------------------------------------------------------------ */

const hasParent = window.parent && window.parent !== window;

const post = (type, payload) => {
  if (!hasParent) return;
  try {
    window.parent.postMessage({ type, ...payload }, '*');
  } catch {
    // A payload that will not structuredClone is a caller error, and dropping
    // it is better than tearing down the render that produced it.
  }
};

/* ------------------------------------------------------------------ *
 * Action tap
 * ------------------------------------------------------------------ */

/**
 * True when `node` is the mount root or lives under it, crossing shadow
 * boundaries on the way up. A ShadowRoot has no parentNode, so the walk hops
 * to its host instead.
 */
const insideMount = (node) => {
  let n = node;
  while (n) {
    if (n === mountRoot) return true;
    n = n.parentNode || n.host || null;
  }
  return false;
};

/**
 * Wrap dispatchEvent once, for the whole realm, before anything mounts.
 *
 * `$emit` is `el.dispatchEvent(new CustomEvent(...))`, and a block nested three
 * levels down emits through its own element. Wrapping the mounted instance
 * would only see events that bubbled all the way out, and would miss any that
 * a nested block stopped. Wrapping the prototype sees every one of them.
 */
const nativeDispatch = EventTarget.prototype.dispatchEvent;
EventTarget.prototype.dispatchEvent = function dispatchEvent(event) {
  try {
    if (event instanceof CustomEvent && this instanceof Node && insideMount(this)) {
      post(PROTOCOL.ACTION, {
        name: event.type,
        detail: serialisable(event.detail),
        time: Date.now()
      });
    }
  } catch {
    // Never let the tap change whether the event dispatches.
  }
  return nativeDispatch.call(this, event);
};

/* ------------------------------------------------------------------ *
 * Console and error forwarding
 * ------------------------------------------------------------------ */

const textOf = (value) => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(serialisable(value));
  } catch {
    return String(value);
  }
};

const forwardLog = (level, args) => {
  post(PROTOCOL.LOG, { level, text: args.map(textOf).join(' ') });
};

for (const [method, level] of [['log', 'log'], ['info', 'log'], ['debug', 'log'], ['warn', 'warn'], ['error', 'error']]) {
  const original = console[method];
  if (typeof original !== 'function') continue;
  console[method] = function patched(...args) {
    forwardLog(level, args);
    return original.apply(console, args);
  };
}

window.addEventListener('error', (event) => {
  forwardLog('error', [event.error || event.message || 'Unknown error']);
});

window.addEventListener('unhandledrejection', (event) => {
  forwardLog('error', [event.reason || 'Unhandled rejection']);
});

/* ------------------------------------------------------------------ *
 * The error panel
 * ------------------------------------------------------------------ */

/**
 * A failed mount must never leave a blank frame with no explanation. The panel
 * lives outside the mount root so wiping the mount does not take it with it.
 */
const errorPanel = document.createElement('pre');
errorPanel.id = 'lego-studio-error';
errorPanel.hidden = true;
document.body.appendChild(errorPanel);

const showError = (err) => {
  errorPanel.textContent = err && err.stack ? err.stack : String(err);
  errorPanel.hidden = false;
};

const clearError = () => {
  errorPanel.textContent = '';
  errorPanel.hidden = true;
};

/* ------------------------------------------------------------------ *
 * Slots
 * ------------------------------------------------------------------ */

/**
 * A named slot's HTML is authored as the content, not as the wrapper, so the
 * `slot="name"` attribute has to be applied here. Top-level elements get it
 * directly; a bare text run is wrapped, because there is nothing else to hang
 * the attribute on.
 */
const applySlotName = (html, name) => {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;

  for (const node of [...tpl.content.childNodes]) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (!node.hasAttribute('slot')) node.setAttribute('slot', name);
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
      const wrapper = document.createElement('span');
      wrapper.setAttribute('slot', name);
      node.replaceWith(wrapper);
      wrapper.appendChild(node);
    }
  }

  return tpl.innerHTML;
};

/**
 * The default slot's content first, then the named ones in name order.
 *
 * The order matters and used to be the story object's own key order, which
 * is whatever the author happened to write. `toRendererSlots` in
 * core/render.js sorts, so a story whose slots were authored `{header, ''}`
 * rendered its children one way on the server and the other way here, and
 * two renderings of one story disagreed for no reason but authoring order.
 * This is the same order, stated the same way.
 */
const slotMarkup = (slots) => {
  if (!slots) return '';
  const parts = [];

  const fallback = typeof slots[''] === 'string' ? slots[''] : slots.default;
  if (typeof fallback === 'string' && fallback !== '') parts.push(fallback);

  Object.keys(slots).sort().forEach((name) => {
    if (name === '' || name === 'default') return;
    const html = slots[name];
    if (typeof html !== 'string' || html === '') return;
    parts.push(applySlotName(html, name));
  });

  return parts.join('');
};

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const findStory = (id) => {
  const blocks = (currentManifest && currentManifest.blocks) || {};
  const order = (currentManifest && currentManifest.order) || Object.keys(blocks);

  for (const tag of order) {
    const stories = (blocks[tag] && blocks[tag].stories) || [];
    for (const story of stories) {
      if (story && story.id === id) return story;
    }
  }

  // A bare tag is accepted as a shorthand for that block's default story, so
  // `/preview?story=my-card` works before any story has been authored.
  if (blocks[id]) {
    const stories = blocks[id].stories || [];
    if (stories.length) return stories[0];
    return { id, block: id, name: 'Default', args: {}, slots: {}, globals: {}, route: null, source: 'implicit' };
  }

  return null;
};

const teardown = () => {
  if (current) {
    try {
      Lego.unsnap(current);
    } catch (err) {
      console.warn('[lego-studio] unsnap failed', err);
    }
    current.remove();
    current = null;
  }
  mountRoot.textContent = '';
};

/**
 * A story's `globals` and `route` are the values templates read as `global`
 * and `$route`. They are written onto the app's reactive globals rather than
 * anywhere block-local, because that is the only object those two names
 * resolve through.
 */
const applyStoryContext = (story) => {
  try {
    if (story.globals && typeof story.globals === 'object') {
      for (const [key, value] of Object.entries(story.globals)) Lego.globals[key] = value;
    }
    if (story.route) Lego.globals.$route = story.route;
  } catch (err) {
    console.warn('[lego-studio] could not apply story context', err);
  }
};

const renderStory = async (story) => {
  if (!story || !story.block) throw new Error('RENDER received a story with no block');

  lastStory = story;
  clearError();
  teardown();
  applyStoryContext(story);

  const el = document.createElement(story.block);

  // Slot content has to be in place before snap(): a light DOM block takes
  // whatever it already contains as its slot content and a shadow block's
  // <slot> projects the light children it finds at attach time.
  const markup = slotMarkup(story.slots);
  if (markup) el.innerHTML = markup;

  // The documented seam for seeding state. snap() merges $initialState over
  // the three logic tiers, and applyProps only fills what is still undefined
  // afterwards, so a story's args beat both the logic and the prop defaults.
  el.$initialState = { ...(story.args || {}) };

  mountRoot.appendChild(el);
  current = el;

  // A defined custom element snapped itself from connectedCallback. Only a
  // tag that has not been upgraded needs the manual call, and snap() must not
  // run twice on the same element.
  if (el.state === undefined) Lego.snap(el);

  if (el.state === undefined) {
    throw new Error(
      `Block "${story.block}" did not mount. Is it registered? ` +
      'Check that its .lego file is inside the studio root.'
    );
  }

  await Lego.nextTick();

  post(PROTOCOL.RENDERED, { storyId: story.id, error: null });
  post(PROTOCOL.STATE, { storyId: story.id, state: serialisable(el.state) });
};

const renderSafely = async (story) => {
  try {
    await renderStory(story);
  } catch (err) {
    showError(err);
    post(PROTOCOL.RENDERED, {
      storyId: story && story.id ? story.id : null,
      error: err && err.message ? err.message : String(err)
    });
  }
};

/**
 * A live write, key by key. `el.state = obj` is a shallow merge that warns and
 * cannot remove a key, so the only correct way to push new args at a mounted
 * block is through the proxy one property at a time.
 */
const applyArgs = async (args) => {
  if (!current || !current.state || !args) return;
  try {
    for (const [key, value] of Object.entries(args)) current.state[key] = value;
    await Lego.nextTick();
    post(PROTOCOL.STATE, {
      storyId: lastStory ? lastStory.id : null,
      state: serialisable(current.state)
    });
  } catch (err) {
    showError(err);
  }
};

const applyTheme = ({ theme, background }) => {
  if (theme) document.documentElement.setAttribute('data-theme', theme);
  if (background) {
    document.documentElement.style.setProperty('--lego-studio-bg', background);
  } else {
    document.documentElement.style.removeProperty('--lego-studio-bg');
  }
};

/* ------------------------------------------------------------------ *
 * Serialising the mounted block
 * ------------------------------------------------------------------ */

/**
 * `outerHTML` stops at the shadow boundary, so it cannot answer the only
 * question worth asking here: is this the markup src/server/render.js would
 * have produced? The walk below is written against that module's `renderHost`
 * and mirrors it exactly, because the whole value of the comparison rests on
 * the two serialisers agreeing about shape. A shadow root comes back out as
 * the `<template shadowrootmode="open">` the server writes, before the light
 * children the browser projects into it, and a void element closes the way
 * `renderPlain` closes it.
 *
 * Escaping matches src/server/html.js rather than the browser's own
 * serialiser: the server escapes the values it computes and carries authored
 * source through untouched, so applying the same rules to text the DOM has
 * already decoded lands on the same string.
 */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'source', 'track', 'wbr'
]);

const RAW_TEXT_TAGS = new Set(['style', 'script', 'textarea', 'title']);

const TEXT_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;' };
const ATTR_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

const escapeText = (value) => String(value).replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);
const escapeAttr = (value) => String(value).replace(/[&<>"]/g, (c) => ATTR_ESCAPES[c]);

const serializeNodes = (nodes) => [...nodes].map(serializeNode).join('');

const serializeElement = (el) => {
  const tag = el.tagName.toLowerCase();
  const attrs = [...el.attributes]
    .map((attr) => ` ${attr.name}="${escapeAttr(attr.value)}"`)
    .join('');
  const open = `<${tag}${attrs}>`;

  if (VOID_TAGS.has(tag)) return open;
  if (RAW_TEXT_TAGS.has(tag)) return `${open}${el.textContent}</${tag}>`;
  // A <template> keeps its children in a fragment rather than as child
  // nodes, so reading childNodes would report it as empty.
  if (tag === 'template') return `${open}${serializeNodes(el.content.childNodes)}</${tag}>`;

  const shadow = el.shadowRoot
    ? `<template shadowrootmode="open">${serializeNodes(el.shadowRoot.childNodes)}</template>`
    : '';
  return `${open}${shadow}${serializeNodes(el.childNodes)}</${tag}>`;
};

function serializeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return escapeText(node.data);
  if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.data}-->`;
  if (node.nodeType === Node.ELEMENT_NODE) return serializeElement(node);
  return '';
}

/** Every tag inside the mounted tree, crossing shadow boundaries. */
const tagsWithin = (node, into = new Set()) => {
  if (node.nodeType === Node.ELEMENT_NODE) {
    into.add(node.tagName.toLowerCase());
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.childNodes) tagsWithin(child, into);
    }
  }
  for (const child of node.childNodes || []) tagsWithin(child, into);
  return into;
};

/**
 * The stylesheets a light DOM block shipped and the framework then moved out
 * of the mounted tree.
 *
 * `adoptLightStyle` puts a light block's scoped CSS in the root the block is
 * actually in, which for a block at the top of the story is `document.head`,
 * outside anything `serializeElement` can reach. The server emits the same
 * CSS inside the host, so leaving these behind would report every light block
 * as having lost its styles. They are appended to the serialised markup and
 * `compare.js` lifts them back out of both sides into a set.
 *
 * Only the tags actually in this story are collected. The preview reuses its
 * realm across renders and never removes an injected stylesheet, so the head
 * still holds whatever a previously mounted story injected.
 */
const hoistedStyles = (el) => {
  const tags = tagsWithin(el);
  return [...document.head.querySelectorAll('style[data-lego-style]')]
    .filter((style) => tags.has(style.getAttribute('data-lego-style')))
    .map(serializeElement)
    .join('');
};

/**
 * Answer a SERIALIZE. Nothing mounted is a reportable state rather than a
 * throw: the manager asked a fair question and deserves the reason.
 *
 * `requestedId` is checked rather than ignored. Queueing behind a pending
 * render is not enough on its own, because the manager's RENDER and the
 * panel's SERIALIZE are two independent postMessages raised by one state
 * change, and nothing orders them. When the SERIALIZE wins that race there is
 * no render in the queue to wait behind, and answering with whatever is still
 * mounted hands the panel the previous story's DOM labelled as a success. A
 * wrong answer that looks right is worse than an error, so this refuses.
 */
const serializeMounted = async (requestedId = null) => {
  const id = lastStory ? lastStory.id : null;
  if (requestedId && id !== requestedId) {
    post(PROTOCOL.SERIALIZED, {
      storyId: id,
      html: '',
      error: `The preview has ${id || 'nothing'} mounted, not ${requestedId}.`
    });
    return;
  }
  if (!current || !current.isConnected) {
    post(PROTOCOL.SERIALIZED, { storyId: id, html: '', error: 'No block is mounted in the preview.' });
    return;
  }
  try {
    // Any pending write has to land first, or the client half of the
    // comparison is a frame behind the server half.
    await Lego.nextTick();
    const html = serializeElement(current) + hoistedStyles(current);
    post(PROTOCOL.SERIALIZED, { storyId: id, html, error: null });
  } catch (err) {
    post(PROTOCOL.SERIALIZED, {
      storyId: id,
      html: '',
      error: err && err.message ? err.message : String(err)
    });
  }
};

/* ------------------------------------------------------------------ *
 * Message plumbing
 * ------------------------------------------------------------------ */

// Renders are serialised. Two RENDERs arriving in the same tick must not race
// each other's teardown, and an ARGS write must land on the element the
// preceding RENDER produced.
const enqueue = (fn) => {
  chain = chain.then(fn).catch((err) => {
    showError(err);
    console.error('[lego-studio]', err);
  });
  return chain;
};

const handle = (message) => {
  switch (message.type) {
    case PROTOCOL.RENDER:
      return enqueue(() => renderSafely(message.story));
    case PROTOCOL.ARGS:
      return enqueue(() => applyArgs(message.args));
    case PROTOCOL.REMOUNT:
      return enqueue(() => (lastStory ? renderSafely(lastStory) : undefined));
    case PROTOCOL.THEME:
      return applyTheme(message);
    case PROTOCOL.SERIALIZE:
      // Queued rather than answered on the spot, so a SERIALIZE arriving in
      // the same tick as a RENDER describes the block that render produced.
      return enqueue(() => serializeMounted(message.storyId || null));
    default:
      return undefined;
  }
};

window.addEventListener('message', (event) => {
  // Only the frame that embedded this one gets to drive it.
  if (event.source !== window.parent) return;
  const message = event.data;
  if (!message || typeof message.type !== 'string') return;
  if (!ready) {
    queued.push(message);
    return;
  }
  handle(message);
});

/* ------------------------------------------------------------------ *
 * Hot reload
 * ------------------------------------------------------------------ */

if (import.meta.hot) {
  import.meta.hot.on(PROTOCOL.INVALIDATE, async () => {
    try {
      // Blocks first: a newly added .lego file has to be registered before a
      // story naming it can mount. Already-loaded files are cached and simply
      // do not re-register.
      await import(/* @vite-ignore */ `${virtualUrl('virtual:lego-studio/blocks')}?t=${Date.now()}`);
      const fresh = await import(/* @vite-ignore */ `${virtualUrl('virtual:lego-studio/manifest')}?t=${Date.now()}`);
      currentManifest = fresh.default || fresh;

      if (lastStory) {
        const updated = findStory(lastStory.id) || lastStory;
        enqueue(() => renderSafely(updated));
      }
    } catch (err) {
      // Falling back to a reload is heavier but always correct, and the story
      // comes back through the ?story= parameter or the manager's next RENDER.
      console.warn('[lego-studio] manifest refresh failed, reloading', err);
      location.reload();
    }
  });
}

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

const boot = async () => {
  // No routes are registered against this app, so the router never matches and
  // never takes over the document. Previewing a block must not navigate.
  await Lego.init(document.body);

  ready = true;
  post(PROTOCOL.READY, {});

  const pending = queued.splice(0, queued.length);
  for (const message of pending) handle(message);

  const wanted = new URLSearchParams(location.search).get('story');
  if (wanted) {
    enqueue(async () => {
      // A queued RENDER already won; do not fight it.
      if (lastStory) return;
      const story = findStory(wanted);
      if (story) {
        await renderSafely(story);
      } else {
        showError(new Error(`No story "${wanted}" in the manifest.`));
      }
    });
  }
};

boot().catch((err) => {
  showError(err);
  post(PROTOCOL.RENDERED, { storyId: null, error: err && err.message ? err.message : String(err) });
});
