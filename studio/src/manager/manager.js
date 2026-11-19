/**
 * Lego Studio manager: entry point.
 *
 * Everything visible is a LegoDOM block. This module only does the three
 * things a block cannot: it pulls the manifest the dev server generated, it
 * puts it somewhere the blocks can read reactively, and it re-pulls it when
 * the server says the files on disk changed.
 *
 * The manifest lives on the app's globals rather than being threaded in as a
 * prop because it is environment, not UI state. `Lego.globals` is an ordinary
 * reactive object, so assigning a new manifest invalidates exactly the
 * getters that read it and the sidebar re-renders itself.
 */

import { Lego } from 'lego-dom';
import manifest from 'virtual:lego-studio/manifest';
import { PROTOCOL } from '../core/contracts.js';

// Order does not matter, but the shell has to exist before it is inserted,
// and every child tag has to be registered before the shell mounts or the
// nested snap pass walks straight past them.
import './blocks/shell.js';
import './blocks/sidebar.js';
import './blocks/canvas.js';
import './blocks/controls.js';
import './blocks/actions.js';
import './blocks/state.js';
import './blocks/hydration.js';

const MANIFEST_MODULE = 'virtual:lego-studio/manifest';

Lego.globals.studio = { manifest };

await Lego.init(document.body);

// Mounted after init rather than sitting in index.html, so the blocks are
// registered and the globals are seeded before the first snap() runs.
document.getElementById('app').innerHTML = '<lego-studio-shell></lego-studio-shell>';

/**
 * Re-read the manifest.
 *
 * The plain specifier is tried first because a Vite virtual module id is
 * matched exactly by the plugin that owns it, and a cache busting query can
 * miss that match. If the plain import comes back with the same object the
 * module graph already handed us, the query form is worth a try before
 * giving up: the point is only ever to end up with fresh data.
 */
const reloadManifest = async (previous) => {
  const candidates = [MANIFEST_MODULE, `${MANIFEST_MODULE}?t=${Date.now()}`];
  for (const specifier of candidates) {
    try {
      const next = (await import(/* @vite-ignore */ specifier)).default;
      if (next && next !== previous) return next;
    } catch (e) {
      /* try the next form */
    }
  }
  return null;
};

if (import.meta.hot) {
  import.meta.hot.on(PROTOCOL.INVALIDATE, async (payload) => {
    // The server may hand the new manifest over with the event, which saves a
    // round trip and sidesteps module caching entirely.
    const inline = payload && payload.manifest;
    const previous = Lego.globals.studio.manifest;
    const next = inline || await reloadManifest(previous);
    if (!next) {
      console.warn('[lego-studio] manifest invalidated but could not be re-read');
      return;
    }
    Lego.globals.studio.manifest = next;
  });
}
