import { snap, unsnap } from './core/lifecycle.js';
import { render } from './core/renderer.js';
import { globalBatcher } from './core/batcher.js';
import { setDefaultApp } from './core/globals.js';
import { config } from './utils/helpers.js';
import { setSnap as setRouterSnap } from './features/router.js';
import { setErrorHandlers } from './features/error.js';
import { setMountHandlers } from './features/mount.js';
import { createApp } from './core/app.js';

// Dependency Injection Setup. The batcher, the error boundaries, the router
// and $mount all need snap/render, and importing them directly would close a
// cycle back through this module, so they are handed in here instead.
globalBatcher.setHandler(render);
setErrorHandlers(snap, render);
setRouterSnap(snap, unsnap);
setMountHandlers(snap, unsnap);

/**
 * The default app.
 *
 * It is an ordinary `createApp()` instance, built around the module level
 * config object so that `Lego.config` is the same object `helpers.js` exports
 * and existing `Lego.config.strict = true` writes keep reaching everything
 * that reads it. Every other app gets a fresh config of its own.
 *
 * It is also the app that any call site with no element or app in hand falls
 * back to (see `appOf` in core/globals.js).
 */
const Lego = createApp({}, { config });

setDefaultApp(Lego);

// Auto-expose to window if in browser
if (typeof window !== 'undefined') {
  window.Lego = Lego;
} else if (typeof global !== 'undefined') {
  global.Lego = Lego;
}

export { Lego, createApp };
export default Lego;
