export const registry = {};
export const proxyCache = new WeakMap();
export const privateData = new WeakMap();
export const forPools = new WeakMap();
export const itemIdMap = new WeakMap(); // Track item IDs without mutating reactive objects
export const activeBlocks = new Set();
// Wildcard global subscribers — woken on any global mutation. Used as a
// fallback when an expression's global access is too dynamic to extract
// a top-level key from (e.g. `global['x']`, computed access, nested
// reads like `global.a.b`).
export const globalSubscribers = new Set();
// Audit fix #20: per-key global subscribers. checkGlobal() in the
// renderer extracts top-level keys from binding expressions and
// registers each (key -> Set<el>) pairing here. The globalsBatcher in
// index.js consults this map (plus the wildcard set above) so a
// mutation to one global key only wakes blocks that read THAT key.
export const globalKeySubscribers = new Map(); // key -> Set<el>
export const legoFileLogic = new Map();
export const sharedStates = new Map();
export const styleRegistry = new Map();
export const snapState = { locked: false };

export const getPrivateData = (el) => {
  if (!privateData.has(el)) {
    privateData.set(el, { snapped: false, bindings: null, bound: false, rendering: false, anchor: null });
  }
  return privateData.get(el);
};
