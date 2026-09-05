export const registry = {};
export const proxyCache = new WeakMap();
export const privateData = new WeakMap();
export const forPools = new WeakMap();
export const itemIdMap = new WeakMap(); // Track item IDs without mutating reactive objects
export const activeBlocks = new Set();
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
