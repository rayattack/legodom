const Lego = (() => {
  const registry = {}, proxyCache = new WeakMap(), privateData = new WeakMap();
  const forPools = new WeakMap();
  const itemIdMap = new WeakMap(); // Track item IDs without mutating reactive objects
  const activeBlocks = new Set();
  const globalSubscribers = new Set();

  const legoFileLogic = new Map();
  const sharedStates = new Map();

  // LRU Cache for compiled expressions (prevents unbounded memory growth)
  class LRUCache {
    constructor(limit = 1000) {
      this.limit = limit;
      this.cache = new Map();
    }

    get(key) {
      if (!this.cache.has(key)) return undefined;

      // Move to end (most recently used) by deleting and re-inserting
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    set(key, value) {
      // If key exists, delete it first so we can re-insert at end
      if (this.cache.has(key)) {
        this.cache.delete(key);
      } else if (this.cache.size >= this.limit) {
        // Evict oldest (first item in Map)
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }

      this.cache.set(key, value);
    }

    get size() {
      return this.cache.size;
    }

    clear() {
      this.cache.clear();
    }
  }

  const expressionCache = new LRUCache(1000); // Max 1000 cached expressions

  const styleRegistry = new Map();
  let styleConfig = {};

  const config = {
    onError: (err, type, el) => {
      console.error(`[Lego Error] [${type}]`, err, el);
    },
    metrics: {},   // Performance hooks
    debug: true,
    syntax: 'brackets' // 'brackets' ([[ ]]) or 'mustache' ({{ }})
  };

  if (config.debug) console.log('[LegoDOM] main.js loaded (Debug Mode)');

  const mergeDescriptors = (source, target) => {
    if (!source || !target) return;
    Object.getOwnPropertyNames(source).forEach(key => {
      const desc = Object.getOwnPropertyDescriptor(source, key);
      Object.defineProperty(target, key, desc);
    });
  };

  const getDelimiters = () => {
    return config.syntax === 'brackets' ? ['[[', ']]'] : ['{{', '}}'];
  };

  const createRegex = () => {
    const [start, end] = getDelimiters();
    // Escape special regex characters
    const s = start.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const e = end.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`${s}(.*?)${e}`, 'g');
  };

  const routes = [];

  const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  };

  const deriveBlockName = (filename) => {
    const basename = filename.split('/').pop().replace(/\.lego$/, '');
    // 1. Convert snake_case to kebab-case
    // 2. Convert PascalCase/camelCase to kebab-case
    const name = basename
      .replace(/_/g, '-')
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase();

    if (!name.includes('-')) {
      throw new Error(`[Lego] Invalid block definition: "${filename}". Block names must contain a hyphen (e.g. user-card.lego or UserCard.lego).`);
    }
    return name;
  };

  /**
   * Enterprise Target Resolver
   * Resolves strings (#id, tag-name) or functions into DOM Elements.
   * This is crucial for the $go router helper to know where to inject content
   */
  const resolveTargets = (query, contextEl) => {
    if (typeof query === 'function') {
      const all = Array.from(document.querySelectorAll('*')).filter(n => n.tagName.includes('-'));
      return [].concat(query(all));
    }
    if (query.startsWith('#')) {
      const el = document.getElementById(query.slice(1));
      return el ? [el] : [];
    }
    // Scoped search first (within the calling block), then global fallback
    const scoped = contextEl?.querySelectorAll(query) || [];
    return scoped.length > 0 ? [...scoped] : [...document.querySelectorAll(query)];
  };

  /**
   * Universal Routing Helper
   * Shared between Lego.globals.$go and template helpers
   */
  const _go = (path, ...targets) => (contextEl) => {
    const execute = async (method, body = null, pushState = true, options = {}) => {
      if (pushState) {
        const serializedTargets = targets.filter(t => typeof t === 'string');
        const state = { legoTargets: serializedTargets, method, body };
        history.pushState(state, '', path);
      }
      await _matchRoute(targets.length ? targets : null, contextEl);
    };

    return {
      get: (push = true, opt = {}) => execute('GET', null, push, opt),
      post: (data, push = true, opt = {}) => execute('POST', data, push, opt),
      put: (data, push = true, opt = {}) => execute('PUT', data, push, opt),
      patch: (data, push = true, opt = {}) => execute('PATCH', data, push, opt),
      delete: (push = true, opt = {}) => execute('DELETE', null, push, opt)
    };
  };

  const createBatcher = () => {
    let queued = false;
    const blocksToUpdate = new Set();
    let isProcessing = false;

    // FIX: Queue for updates arriving during processing (prevents drops)
    const pendingQueue = new Set();

    // Optimization: Single timer for all updated hooks instead of one per block
    let updatedTimer = null;
    const pendingUpdated = new Set();

    const scheduleUpdatedHooks = () => {
      if (updatedTimer) clearTimeout(updatedTimer);
      updatedTimer = setTimeout(() => {
        pendingUpdated.forEach(el => {
          const state = el._studs;
          if (state && typeof state.updated === 'function') {
            try { state.updated.call(state); } catch (e) { console.error(`[Lego] Error in updated hook:`, e); }
          }
        });
        pendingUpdated.clear();
        updatedTimer = null;
      }, 50); // Global debounce
    };

    const processPendingQueue = () => {
      if (pendingQueue.size > 0) {
        // Move pending to main queue
        pendingQueue.forEach(el => blocksToUpdate.add(el));
        pendingQueue.clear();

        // Trigger next batch if not already queued
        if (!queued && blocksToUpdate.size > 0) {
          queued = true;
          requestAnimationFrame(processBatch);
        }
      }
    };

    const processBatch = () => {
      isProcessing = true;
      const batch = Array.from(blocksToUpdate);
      blocksToUpdate.clear();
      queued = false;

      // Simple synchronous render loop (faster for small batches, no overhead)
      batch.forEach(el => {
        if (el.isConnected) render(el);
      });

      // Batch complete: Queue updated hooks efficiently
      batch.forEach(el => pendingUpdated.add(el));
      scheduleUpdatedHooks();
      isProcessing = false;

      // FIX: Process pending queue after batch completes
      processPendingQueue();
    };

    return {
      add: (el) => {
        if (!el) return;

        // FIX: Queue during processing instead of dropping
        if (isProcessing) {
          pendingQueue.add(el);
          return;
        }

        blocksToUpdate.add(el);
        if (queued) return;
        queued = true;

        requestAnimationFrame(processBatch);
      }
    };
  };

  const globalBatcher = createBatcher();

  // --- Persistence Layer ($db) ---
  const dbBindings = new Map(); // storageKey -> Set<{target, prop}>
  const dbTimers = new Map();   // storageKey -> timerId

  const registerDbBinding = (target, prop, key) => {
    if (!dbBindings.has(key)) dbBindings.set(key, new Set());
    dbBindings.get(key).add({ target, prop });
  };

  // Storage quota management (FIFO eviction)
  const storageKeys = new Map(); // key -> { timestamp, size }

  const evictOldestKeys = (bytesNeeded) => {
    const entries = Array.from(storageKeys.entries())
      .filter(([key]) => key.startsWith('lego:')) // Only evict Lego keys
      .sort((a, b) => a[1].timestamp - b[1].timestamp); // Oldest first

    let freedBytes = 0;
    const evicted = [];

    for (const [key, meta] of entries) {
      if (freedBytes >= bytesNeeded) break;

      try {
        localStorage.removeItem(key);
        freedBytes += meta.size;
        evicted.push(key);
        storageKeys.delete(key);
      } catch (e) {
        console.error(`[Lego] Failed to evict ${key}:`, e);
      }
    }

    return evicted;
  };

  const scheduleSave = (key, value, debounce) => {
    if (config.debug) console.log('[Lego Trace] scheduleSave', key, value, debounce);
    if (dbTimers.has(key)) clearTimeout(dbTimers.get(key));
    const save = () => {
      try {
        const serialized = JSON.stringify(value);
        const sizeBytes = new Blob([serialized]).size;

        // Attempt write
        localStorage.setItem(key, serialized);

        // Track for eviction (prefix with 'lego:' for identification)
        const storageKey = key.startsWith('lego:') ? key : `lego:${key}`;
        storageKeys.set(storageKey, {
          timestamp: Date.now(),
          size: sizeBytes
        });

        dbTimers.delete(key);
      } catch (e) {
        if (e.name === 'QuotaExceededError') {
          console.warn(`[Lego] Storage quota exceeded for key: ${key}`);

          // Attempt eviction and retry
          try {
            const serialized = JSON.stringify(value);
            const sizeBytes = new Blob([serialized]).size;
            const evicted = evictOldestKeys(sizeBytes * 2); // Free 2x needed space

            if (evicted.length > 0) {
              console.log(`[Lego] Evicted ${evicted.length} old keys, retrying save`);
              localStorage.setItem(key, serialized);

              const storageKey = key.startsWith('lego:') ? key : `lego:${key}`;
              storageKeys.set(storageKey, {
                timestamp: Date.now(),
                size: sizeBytes
              });
            } else {
              config.onError(new Error(`Storage quota exceeded and no keys available for eviction`), 'quota', key);
            }
          } catch (retryErr) {
            config.onError(new Error(`Critical: Could not save ${key} even after eviction`), 'quota-critical', key);
          }
        } else {
          console.error(`[Lego] Storage Error (${key}):`, e);
        }
      }
    };
    if (debounce > 0) {
      dbTimers.set(key, setTimeout(save, debounce));
    } else {
      save();
    }
  };

  // Cross-tab Synchronization
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (!e.key || !dbBindings.has(e.key)) return;
      try {
        const newValue = JSON.parse(e.newValue);
        dbBindings.get(e.key).forEach(({ target, prop, el, batcher }) => {
          target[prop] = newValue; // Update raw data
          if (el && batcher) batcher.add(el); // Trigger re-render
        });
      } catch (e) {
        console.warn(`[Lego] Cross-tab sync error:`, e);
      }
    });
  }

  const dbMetadata = new WeakMap(); // target -> { prop: { key, debounce } }

  const isNode = (val) => typeof Node !== 'undefined' && val instanceof Node;

  const reactive = (obj, el, batcher = globalBatcher) => {
    if (obj === null || typeof obj !== 'object' || isNode(obj)) return obj;
    if (proxyCache.has(obj)) return proxyCache.get(obj);

    // Hydrate $db descriptors
    for (const k in obj) {
      const propDesc = Object.getOwnPropertyDescriptor(obj, k);
      if (propDesc && propDesc.get) continue; // Skip getters to avoid execution

      const desc = obj[k];
      if (config.debug && desc && desc.__type === 'lego-db') console.log('[Lego Trace] Reactive DB Init:', k, desc);
      if (desc && desc.__type === 'lego-db') {
        let val = desc._default;
        try {
          const item = localStorage.getItem(desc.key);
          if (item !== null) val = JSON.parse(item);
        } catch (e) {
          console.warn(`[Lego] Failed to parse localStorage value for key "${desc.key}":`, e);
        }

        obj[k] = val; // Replace descriptor with value

        // Register metadata
        if (!dbMetadata.has(obj)) dbMetadata.set(obj, {});
        dbMetadata.get(obj)[k] = { key: desc.key, debounce: desc._debounce };
        if (config.debug) console.log('[Lego Trace] DB Metadata Set:', k, dbMetadata.get(obj)[k]);

        // Register for cross-tab updates
        if (!dbBindings.has(desc.key)) dbBindings.set(desc.key, new Set());
        dbBindings.get(desc.key).add({ target: obj, prop: k, el, batcher });
      }
    }

    const handler = {
      get: (t, k) => {
        const val = Reflect.get(t, k);
        if (val !== null && typeof val === 'object' && !isNode(val)) {
          return reactive(val, el, batcher);
        }
        return val;
      },
      set: (t, k, v, receiver) => {
        // FIX: Pass receiver to Reflect.set to ensure we set property on the correct object 
        // (e.g. localScope inheriting from state) instead of forcing it onto state.
        const old = t[k];
        if (config.debug && old !== v) console.log('[Lego Trace] Reactive SET:', k, 'Old:', old, 'New:', v, 'Target:', t);
        const r = Reflect.set(t, k, v, receiver);

        // Only trigger reactivity if the update was effectively on THIS proxy
        // If receiver is a child object (like localScope in b-for), we don't want to trigger parent updates
        const isSelf = receiver === proxyCache.get(t);
        if (config.debug) {
          const meta = dbMetadata.get(t);
          if (config.debug) console.log('[Lego Trace] Receiver check:', k, isSelf, 'Meta:', meta ? JSON.stringify(meta[k]) : 'None');
        }
        if (isSelf) {
          // Use previously captured 'old' value because 't[k]' is already updated by Reflect.set
          if (old !== v) {
            batcher.add(el);
            // Check for DB binding
            const meta = dbMetadata.get(t);
            if (meta && meta[k]) {
              scheduleSave(meta[k].key, v, meta[k].debounce);
            }
          }
        }
        return r;
      },
      deleteProperty: (t, k) => {
        const r = Reflect.deleteProperty(t, k);
        batcher.add(el);
        return r;
      }
    };

    const p = new Proxy(obj, handler);
    proxyCache.set(obj, p);
    return p;
  };

  const parseJSObject = (raw, scope = {}) => {
    if (!raw || raw.trim() === '{}') return {};
    try {
      return (new Function('scope', 'global', `with(global) { with(scope) { return (${raw}); } }`))(scope, Lego.globals);
    } catch (e) {
      console.error(`[Lego] Error parsing b-data/b-logic: "${raw.length > 80 ? raw.slice(0, 80) + '...' : raw}"`, e);
      return {};
    }
  };

  const getPrivateData = (el) => {
    if (!privateData.has(el)) {
      privateData.set(el, { snapped: false, bindings: null, bound: false, rendering: false, anchor: null });
    }
    return privateData.get(el);
  };

  const resolve = (path, obj) => {
    if (!path) return '';
    const parts = path.trim().split('.');
    let current = obj;
    for (const part of parts) {
      if (current == null) return '';
      current = current[part];
    }
    return current ?? '';
  };

  const findAncestor = (el, tagName) => {
    if (!el) return undefined;
    let parent = el.parentElement || (el.getRootNode ? el.getRootNode().host : null);
    while (parent) {
      const pName = parent.tagName ? parent.tagName.toLowerCase() : '';
      if (pName) {
        if (tagName === '*' && registry[pName]) return parent;
        if (pName === tagName.toLowerCase()) return parent;
      }
      parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
    }
    return undefined;
  };

  /**
   * Find the nearest error boundary for a crashed element
   * Checks instance attribute, template attribute, then bubbles up parent chain
   */
  const findErrorBoundary = (el) => {
    let current = el;
    while (current) {
      // 1. Check instance-level attribute (override)
      const instanceError = current.getAttribute && current.getAttribute('b-error');
      if (instanceError) {
        return { errorTag: instanceError, targetElement: current };
      }

      // 2. Check template-level attribute (default)
      const tagName = current.tagName ? current.tagName.toLowerCase() : '';
      const templateNode = registry[tagName];
      if (templateNode) {
        const templateError = templateNode.getAttribute('b-error');
        if (templateError) {
          return { errorTag: templateError, targetElement: current };
        }
      }

      // 3. Bubble up to parent
      current = current.parentElement || (current.getRootNode && current.getRootNode().host);
    }
    return null;
  };

  /**
   * Render an error block in place of a crashed component
   */
  const renderErrorBlock = (errorTag, crashedEl, err) => {
    try {
      // Clear the crashed element's content
      if (crashedEl.shadowRoot) {
        crashedEl.shadowRoot.innerHTML = '';
      } else {
        crashedEl.innerHTML = '';
      }

      // Create the error block
      const errorBlock = document.createElement(errorTag);

      // Append to crashed element
      const target = crashedEl.shadowRoot || crashedEl;
      target.appendChild(errorBlock);

      // Snap the error block first to initialize its state
      snap(errorBlock);

      // Inject error information into the error block's state (after snapping)
      if (errorBlock._studs) {
        errorBlock._studs.$error = {
          message: err.message,
          stack: err.stack,
          component: crashedEl.tagName.toLowerCase()
        };
        // Trigger a render to update the error display
        render(errorBlock);
      }
    } catch (renderErr) {
      // If error rendering fails, fall back to console
      console.error('[Lego] Error boundary failed to render:', renderErr);
      console.error('[Lego] Original error:', err);
    }
  };

  const safeEval = (expr, context, throwError = true) => {
    // 1. Security: Block dangerous patterns
    if (/\b(function|eval|import|class|module|deploy|constructor|__proto__)\b/.test(expr)) {
      console.warn(`[Lego] Security Warning: Blocked dangerous expression "${expr}"`);
      return undefined;
    }

    try {
      const scope = context.state || {};

      // 2. Performance: Check cache
      // We purposefully cache based on the expression string alone.
      // The 'helpers' and 'state' are passed dynamically to the cached function.
      let func = expressionCache.get(expr);
      if (!func) {
        // Removed inner try-catch to allow error propagation to the caller
        // Scope order: helpers first (for $route, $go, etc.), then state
        func = new Function('global', 'self', 'event', 'helpers', `
          with(this) {
            with(helpers) { 
              return ${expr}
            }
          }
        `);
        expressionCache.set(expr, func);
      }

      const helpers = {
        $ancestors: (tag) => findAncestor(context.self, tag),
        $registry: (tag) => sharedStates.get(tag.toLowerCase()),
        $element: context.self,
        $route: Lego.globals.$route,
        $go: (path, ...targets) => _go(path, ...targets)(context.self),
        $emit: (name, detail) => {
          context.self.dispatchEvent(new CustomEvent(name, {
            detail,
            bubbles: true,
            composed: true
          }));
        }
      };

      const result = func.call(scope, context.global, context.self, context.event, helpers);
      if (typeof result === 'function') return result.call(scope, context.event);
      return result;
    } catch (e) {
      if (throwError) throw e;
      config.onError(e, 'render-error', context.self);
      return undefined;
    }
  };

  const syncModelValue = (el, val) => {
    if (el.type === 'checkbox') {
      if (el.checked !== !!val) el.checked = !!val;
    } else {
      const normalized = (val === undefined || val === null) ? '' : String(val);
      if (el.value !== normalized) el.value = normalized;
    }
  };

  const bind = (container, blockRoot, loopCtx = null) => {
    const state = blockRoot._studs;

    const bindNode = (child) => {
      const childData = getPrivateData(child);
      if (childData.bound) return;

      if (child.hasAttributes()) {
        const attrs = child.attributes;
        for (let i = 0; i < attrs.length; i++) {
          const attr = attrs[i];
          if (attr.name.startsWith('@')) {
            const parts = attr.name.slice(1).split('.');
            const eventName = parts[0];
            const modifiers = parts.slice(1);

            child.addEventListener(eventName, (event) => {
              // Action Modifiers
              if (modifiers.includes('prevent')) event.preventDefault();
              if (modifiers.includes('stop')) event.stopPropagation();
              if (modifiers.includes('self') && event.target !== event.currentTarget) return;

              // Keyboard Modifiers
              if (typeof KeyboardEvent !== 'undefined' && event instanceof KeyboardEvent) {
                // System Keys (AND logic)
                if (modifiers.includes('ctrl') && !event.ctrlKey) return;
                if (modifiers.includes('alt') && !event.altKey) return;
                if (modifiers.includes('shift') && !event.shiftKey) return;
                if (modifiers.includes('meta') && !event.metaKey) return;

                // Key Matchers (OR logic for non-system/action modifiers)
                const keyModifiers = modifiers.filter(m =>
                  !['prevent', 'stop', 'self', 'ctrl', 'alt', 'shift', 'meta', 'capture', 'once', 'passive'].includes(m)
                );

                if (keyModifiers.length > 0) {
                  const pressed = event.key.toLowerCase();
                  const isMatch = keyModifiers.some(mod => {
                    // Aliases
                    if (mod === 'enter') return pressed === 'enter';
                    if (mod === 'esc' || mod === 'escape') return pressed === 'escape';
                    if (mod === 'space') return pressed === ' ';
                    if (mod === 'tab') return pressed === 'tab';
                    if (mod === 'delete') return pressed === 'delete';
                    if (mod === 'backspace') return pressed === 'backspace';
                    if (mod === 'up') return pressed === 'arrowup';
                    if (mod === 'down') return pressed === 'arrowdown';
                    if (mod === 'left') return pressed === 'arrowleft';
                    if (mod === 'right') return pressed === 'arrowright';

                    // Categories
                    if (mod === 'alpha') return /^[a-z]$/.test(pressed);
                    if (mod === 'numbers') return /^[0-9]$/.test(pressed);

                    // Direct match (case-insensitive)
                    return mod === pressed;
                  });
                  if (!isMatch) return;
                }
              }
              try {
                let evalScope = state;
                if (loopCtx) {
                  const list = safeEval(loopCtx.listName, { state, global: Lego.globals, self: blockRoot });
                  const item = list[loopCtx.index];
                  evalScope = Object.assign(Object.create(state), { [loopCtx.name]: item });
                }
                safeEval(attr.value, { state: evalScope, global: Lego.globals, self: child, event, $event: event }, true);
              } catch (err) {
                const boundary = findErrorBoundary(blockRoot);
                if (boundary) {
                  renderErrorBlock(boundary.errorTag, boundary.targetElement, err);
                } else {
                  config.onError(err, 'event-handler', child);
                }
              }
            });
          }
        }

        if (child.hasAttribute('b-sync')) {
          const prop = child.getAttribute('b-sync');
          const updateState = () => {
            try {
              let target, last;
              if (loopCtx && prop.startsWith(loopCtx.name + '.')) {
                const list = safeEval(loopCtx.listName, { state, global: Lego.globals, self: blockRoot });
                const item = list[loopCtx.index];
                if (!item) return;
                const subPath = prop.split('.').slice(1);
                last = subPath.pop();
                target = subPath.reduce((o, k) => o[k], item);
              } else {
                const keys = prop.split('.');
                last = keys.pop();
                target = keys.reduce((o, k) => o[k], state);
              }
              const newVal = child.type === 'checkbox' ? child.checked : child.value;
              if (target && target[last] !== newVal) target[last] = newVal;
            } catch (err) {
              config.onError(err, 'sync-update', child);
            }
          };
          child.addEventListener('input', updateState);
          child.addEventListener('change', updateState);
        }

        // b-var: Register element reference
        if (child.hasAttribute('b-var')) {
          const varName = child.getAttribute('b-var');
          if (state.$vars) {
            state.$vars[varName] = child;
          }
        }
      }
      childData.bound = true;
    };

    if (container instanceof Element) bindNode(container);

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT);
    let child;
    while (child = walker.nextNode()) bindNode(child);
  };

  const scanForBindings = (container) => {
    const bindings = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    const pendingOperations = []; // Queue DOM modifications to avoid breaking TreeWalker

    while (node = walker.nextNode()) {
      const current = node; // Capture for closure
      const isInsideBoundary = (n) => {
        let curr = n.parentNode;
        while (curr && curr !== container) {
          if (curr.hasAttribute && curr.hasAttribute('b-for')) return true;
          // Only stop at Shadow Roots or explicit boundaries, NOT block tags in Light DOM
          // The parent MUST be able to bind data to the slots of its children.
          curr = curr.parentNode;
        }
        return false;
      };
      if (isInsideBoundary(node)) continue;

      const checkGlobal = (str) => {
        if (/\bglobal\b/.test(str)) {
          const target = container.host || container;
          globalSubscribers.add(target);
        }
      };

      if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.hasAttribute('b-if')) {
          const expr = node.getAttribute('b-if');
          checkGlobal(expr);
          // Create an anchor point to keep track of where the element belongs in the DOM
          const anchor = document.createComment(`b-if: ${expr}`);
          const data = getPrivateData(node);
          data.anchor = anchor;
          bindings.push({ type: 'b-if', node, anchor, expr });
        }

        if (node.hasAttribute('b-show')) {
          const expr = node.getAttribute('b-show');
          checkGlobal(expr);
          bindings.push({ type: 'b-show', node, expr });
        }
        if (node.hasAttribute('b-for')) {
          const match = node.getAttribute('b-for').match(/^\s*(\w+)\s+in\s+([\s\S]+?)\s*$/);
          if (match) {
            checkGlobal(match[2]);
            // Create anchor comment to mark where clones will be inserted
            const anchor = document.createComment(`b-for: ${match[1]} in ${match[2].trim()}`);

            // DEFER DOM MODIFICATION
            pendingOperations.push(() => {
              if (current.parentNode) {
                current.parentNode.insertBefore(anchor, current);
                current.remove();
              }
            });

            bindings.push({
              type: 'b-for',
              anchor,  // Use anchor instead of node
              itemName: match[1],
              listName: match[2].trim(),
              keyPath: node.getAttribute('b-key') || null,
              template: node.cloneNode(true)  // Store the whole node as template
            });
          }
        }
        if (node.hasAttribute('b-text')) bindings.push({ type: 'b-text', node, path: node.getAttribute('b-text') });
        if (node.hasAttribute('b-html')) {
          const expr = node.getAttribute('b-html');
          checkGlobal(expr);
          bindings.push({ type: 'b-html', node, expr });
        }
        if (node.hasAttribute('b-sync')) bindings.push({ type: 'b-sync', node });
        const [start] = getDelimiters();
        [...node.attributes].forEach(attr => {
          if (attr.value.includes(start)) {
            checkGlobal(attr.value);
            bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
          }
        });
      } else if (node.nodeType === Node.TEXT_NODE) {
        const [start] = getDelimiters();
        if (config.debug) console.log('[Lego Debug] Scanning text:', node.textContent.trim().slice(0, 50), 'Start:', start, 'Includes:', node.textContent.includes(start));
        if (node.textContent.includes(start)) {
          checkGlobal(node.textContent);
          bindings.push({ type: 'text', node, template: node.textContent });
        }
      }
    }

    // Execute deferred DOM modifications
    pendingOperations.forEach(op => op());

    return bindings;
  };

  const updateNodeBindings = (root, scope) => {
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node._tpl === undefined) node._tpl = node.textContent;
        const out = node._tpl.replace(createRegex(), (_, k) => safeEval(k.trim(), { state: scope, global: Lego.globals, self: node }) ?? '');
        if (node.textContent !== out) node.textContent = out;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const [start] = getDelimiters();
        [...node.attributes].forEach(attr => {
          if (attr._tpl === undefined) attr._tpl = attr.value;
          if (attr._tpl.includes(start)) {
            const out = attr._tpl.replace(createRegex(), (_, k) => safeEval(k.trim(), { state: scope, global: Lego.globals, self: node }) ?? '');
            if (attr.value !== out) {
              attr.value = out;
              if (attr.name === 'class') node.className = out;
            }
          }
        });
      }
    };
    processNode(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let n;
    while (n = walker.nextNode()) processNode(n);
  };

  const render = (el) => {
    if (config.debug) console.log('[Lego Trace] render() called for:', el.tagName);
    const state = el._studs;
    if (!state) return;
    const data = getPrivateData(el);
    if (data.rendering) return;
    data.rendering = true;
    if (config.metrics && config.metrics.onRenderStart) config.metrics.onRenderStart(el);

    try {
      // Use shadowRoot if it's a block, otherwise render the element itself (light DOM)
      const target = el.shadowRoot || el;
      if (!data.bindings) data.bindings = scanForBindings(target);

      data.bindings.forEach(b => {
        // ... (binding logic remains same, just uses b.node which is relative to target)
        if (b.type === 'b-if') {
          const condition = !!safeEval(b.expr, { state, global: Lego.globals, self: b.node });
          const isAttached = !!b.node.parentNode;
          if (condition && !isAttached) {
            if (b.anchor.parentNode) b.anchor.parentNode.replaceChild(b.node, b.anchor);
          } else if (!condition && isAttached) {
            b.node.parentNode.replaceChild(b.anchor, b.node);
          }
        }
        if (b.type === 'b-show') b.node.style.display = safeEval(b.expr, { state, global: Lego.globals, self: b.node }) ? '' : 'none';
        if (b.type === 'b-text') b.node.textContent = resolve(b.path, state);
        if (b.type === 'b-html') b.node.innerHTML = safeEval(b.expr, { state, global: Lego.globals, self: b.node }) || '';
        if (b.type === 'b-sync') syncModelValue(b.node, resolve(b.node.getAttribute('b-sync'), state));
        if (b.type === 'text') {
          const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: Lego.globals, self: b.node }) ?? '');
          if (b.node.textContent !== out) b.node.textContent = out;
        }
        if (b.type === 'attr') {
          const out = b.template.replace(createRegex(), (_, k) => safeEval(k.trim(), { state, global: Lego.globals, self: b.node }) ?? '');
          if (b.node.getAttribute(b.attrName) !== out) {
            b.node.setAttribute(b.attrName, out);
            if (b.attrName === 'class') b.node.className = out;
          }
        }
        if (b.type === 'b-for') {
          const list = safeEval(b.listName, { state, global: Lego.globals, self: el }) || [];
          if (!forPools.has(b.anchor)) forPools.set(b.anchor, new Map());
          const pool = forPools.get(b.anchor);
          const currentKeys = new Set();
          const renderedChildren = [];  // Track order of rendered children

          list.forEach((item, i) => {
            // Smart key generation: b-key > common id fields > __id fallback
            let key;
            if (b.keyPath) {
              // User specified b-key="propertyName"
              key = resolve(b.keyPath, item);
              if (key === undefined) {
                console.warn(`[Lego] b-key="${b.keyPath}" resolved to undefined for item at index ${i}. Check for typos.`);
              }
            } else if (item && typeof item === 'object') {
              // Auto-detect common ID fields
              key = item.id || item._id || item.uuid || item.key;
              // Fallback to WeakMap-based ID (no mutation, no reactivity trigger)
              if (key === undefined) {
                if (!itemIdMap.has(item)) {
                  itemIdMap.set(item, Math.random());
                }
                key = itemIdMap.get(item);
              }
            } else {
              // Primitive values: use index + value
              key = `${i}-${item}`;
            }
            currentKeys.add(key);
            let child = pool.get(key);
            if (!child) {
              child = b.template.cloneNode(true);
              child.removeAttribute('b-for');
              child.removeAttribute('b-key');
              pool.set(key, child);
              bind(child, el, { name: b.itemName, listName: b.listName, index: i });
            }
            const localScope = Object.assign(Object.create(state), { [b.itemName]: item, $index: i });
            updateNodeBindings(child, localScope);

            child.querySelectorAll('[b-sync]').forEach(input => {
              const path = input.getAttribute('b-sync');
              if (path.startsWith(b.itemName + '.')) {
                const list = safeEval(b.listName, { state, global: Lego.globals, self: el });
                syncModelValue(input, resolve(path.split('.').slice(1).join('.'), list[i]));
              }
            });
            renderedChildren.push(child);
          });

          // Insert/reorder children as siblings after the anchor
          let insertPoint = b.anchor.nextSibling;
          renderedChildren.forEach(child => {
            if (child !== insertPoint) {
              b.anchor.parentNode.insertBefore(child, insertPoint);
            } else {
              insertPoint = insertPoint.nextSibling;
            }
          });

          // Remove stale nodes
          for (const [key, node] of pool.entries()) {
            if (!currentKeys.has(key)) { node.remove(); pool.delete(key); }
          }
        }
      });

      // Global Broadcast: Only notify blocks that depend on globals
      if (state === Lego.globals) {
        globalSubscribers.forEach(block => render(block));
      }
    } catch (err) {
      const boundary = findErrorBoundary(el);
      if (boundary) {
        renderErrorBlock(boundary.errorTag, boundary.targetElement, err);
      } else {
        config.onError(err, 'render', el);
      }
    } finally {
      if (config.metrics && config.metrics.onRenderEnd) config.metrics.onRenderEnd(el);
      data.rendering = false;
    }
  };

  const snap = (el) => {
    if (config.debug) console.log('[Lego Trace] snap() called for:', el.tagName);
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    const data = getPrivateData(el);
    const name = el.tagName.toLowerCase();
    const templateNode = registry[name];

    if (templateNode && !data.snapped) {
      data.snapped = true;
      const tpl = templateNode.content.cloneNode(true);
      const shadow = el.attachShadow({ mode: 'open' });

      // Stylesheet Application: Definition + Instance + Inheritance (Cascade)
      const defStyles = (templateNode.getAttribute('b-stylesheets') || "").split(/\s+/).filter(Boolean);
      const instStyles = (el.getAttribute('b-stylesheets') || "").split(/\s+/).filter(Boolean);

      // Calculate inherited styles from ancestors with b-cascade
      const inheritedStyles = [];
      let parent = el.parentElement || (el.getRootNode ? el.getRootNode().host : null);
      while (parent) {
        // Check instance cascade
        const instCascade = (parent.getAttribute('b-cascade') || "").split(/\s+/).filter(Boolean);
        if (instCascade.length) inheritedStyles.push(...instCascade);

        // Check definition cascade (if parent is a Lego block)
        const pName = parent.tagName ? parent.tagName.toLowerCase() : '';
        if (registry[pName]) {
          const defCascade = (registry[pName].getAttribute('b-cascade') || "").split(/\s+/).filter(Boolean);
          if (defCascade.length) inheritedStyles.push(...defCascade);
        }

        parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
      }

      // Merge: Explicit (Definition + Instance) > Inherited
      const explicit = [...new Set([...defStyles, ...instStyles])];
      const inherited = [...new Set(inheritedStyles)]; // Dedup inherited
      const allStyleNames = [...new Set([...inherited, ...explicit])]; // Dedup all

      if (allStyleNames.length > 0) {
        const sheetsToApply = allStyleNames.flatMap(key => styleRegistry.get(key) || []);
        if (sheetsToApply.length > 0) {
          shadow.adoptedStyleSheets = [...sheetsToApply];
        }
      }

      // Metadata for DevTools
      el._studsMeta = {
        stylesheets: {
          explicit,
          inherited,
          applied: allStyleNames
        }
      };

      // TIER 1: Logic from Lego.block (Lego File)
      // TIER 2: Logic from the <template b-data="..."> attribute
      // TIER 3: Logic from the <my-comp b-data="..."> tag
      // SCOPED PROPS: Use parent block state as scope for instance logic evaluation
      const parentBlock = findAncestor(el, '*') || findAncestor(el.getRootNode().host, '*');
      const parentScope = parentBlock && parentBlock.state ? parentBlock.state : {};

      const scriptLogic = legoFileLogic.get(name) || {};
      const templateLogic = parseJSObject(templateNode.getAttribute('b-logic') || templateNode.getAttribute('b-data') || '{}');
      const instanceLogic = parseJSObject(el.getAttribute('b-logic') || el.getAttribute('b-data') || '{}', parentScope);

      const baseState = {
        $vars: {},
        $element: el,
        get $parent() { return findAncestor(el, '*') },
        $emit: (name, detail) => {
          el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
        },
        get $route() { return Lego.globals.$route },
        get $go() { return Lego.globals.$go }
      };

      mergeDescriptors(scriptLogic, baseState);
      mergeDescriptors(templateLogic, baseState);
      mergeDescriptors(instanceLogic, baseState);

      el._studs = reactive(baseState, el);

      Object.defineProperty(el, 'state', {
        get() { return this._studs },
        set(v) { Object.assign(this._studs, v) },
        configurable: true,
        enumerable: false
      });

      shadow.appendChild(tpl);

      const style = shadow.querySelector('style');
      if (style) {
        style.textContent = style.textContent.replace(/\bself\b/g, ':host');
      }

      bind(shadow, el);
      activeBlocks.add(el);
      render(el);

      // Deeply initialize all nested components
      const nestedComponents = shadow.querySelectorAll('*');
      if (config.debug) console.log('[Lego Debug] Nested scan in', el.tagName, '- Found elements:', nestedComponents.length);
      nestedComponents.forEach(child => {
        const childTag = child.tagName.toLowerCase();
        const isRegistered = !!registry[childTag];
        if (config.debug && childTag.includes('-')) {
          console.log('[Lego Debug] Checking', childTag, '- Registered:', isRegistered);
        }
        if (isRegistered) snap(child);
      });

      // Track this shadow root for later component registration
      if (!el._legoShadow) el._legoShadow = shadow;

      if (typeof el._studs.mounted === 'function') {
        try {
          el._studs.mounted.call(el._studs);
        } catch (e) {
          const boundary = findErrorBoundary(el);
          if (boundary) {
            renderErrorBlock(boundary.errorTag, boundary.targetElement, e);
          } else {
            config.onError(e, 'mounted', el);
          }
        }
      }
    }

    let provider = el.parentElement;
    while (provider && !provider._studs) provider = provider.parentElement;
    if (provider && provider._studs) bind(el, provider);

    [...el.children].forEach(snap);
  };

  const unsnap = (el) => {
    // 1. Call unmounted lifecycle hook first
    if (el._studs && typeof el._studs.unmounted === 'function') {
      try {
        el._studs.unmounted.call(el._studs);
      } catch (e) {
        const boundary = findErrorBoundary(el);
        if (boundary) {
          renderErrorBlock(boundary.errorTag, boundary.targetElement, e);
        } else {
          console.error(`[Lego] Error in unmounted:`, e);
        }
      }
    }

    // 2. Recursively unsnap children in shadowRoot
    if (el.shadowRoot) {
      [...el.shadowRoot.children].forEach(unsnap);
    }

    // 3. Remove from active blocks tracking
    activeBlocks.delete(el);
    globalSubscribers.delete(el);

    // 4. Break circular references
    if (el._studs) {
      // Clear element references in state object
      el._studs.$element = null;

      // Clear $vars references to DOM elements
      if (el._studs.$vars) {
        Object.keys(el._studs.$vars).forEach(key => {
          el._studs.$vars[key] = null;
        });
        el._studs.$vars = null;
      }

      // Clear closure-captured references to prevent memory leaks
      // These closures in getters/functions capture 'el' and must be cleared
      if (el._studs.$emit) el._studs.$emit = null;
      delete el._studs.$parent;  // Getter that captures el
      delete el._studs.$route;   // Getter
      delete el._studs.$go;       // Getter

      // Break the proxy -> element reference
      el._studs = null;
    }

    if (el.hasOwnProperty('state')) delete el.state;
    // 6. Clear private data (bindings, flags, etc.)
    // This removes references to DOM nodes in bindings array
    const data = privateData.get(el);
    if (data) {
      // Clear bindings that hold node references
      if (data.bindings) {
        data.bindings.forEach(binding => {
          binding.node = null;
          binding.anchor = null;
        });
        data.bindings = null;
      }
      data.anchor = null;
      privateData.delete(el);
    }

    // 7. Clear from for-loop pools (prevents pooled nodes from keeping refs)
    if (forPools.has(el)) {
      const pool = forPools.get(el);
      pool.forEach((node, key) => {
        if (node && node._studs) {
          node._studs = null;
        }
      });
      pool.clear();
      forPools.delete(el);
    }

    // 8. Note: proxyCache is a WeakMap so we can't delete from it,
    // but breaking the circular refs above allows GC to clean it up

    // 9. Recursively unsnap light DOM children
    [...el.children].forEach(unsnap);
  };

  const _matchRoute = async (targetQueries = null, contextEl = null) => {
    const path = window.location.pathname;
    const search = window.location.search;
    const match = routes.find(r => r.regex.test(path));
    console.log('Matching route', path, match);
    if (!match) return;

    // Resolve targets: Functional selectors > List of queries > History State > Default lego-router
    let resolvedElements = [];
    if (targetQueries) {
      resolvedElements = targetQueries.flatMap(query => resolveTargets(query, contextEl));
    } else {
      const defaultOutlet = document.querySelector('lego-router');
      if (defaultOutlet) resolvedElements = [defaultOutlet];
    }
    console.log('Matching route', window.location.pathName)

    if (resolvedElements.length === 0) return;

    const values = path.match(match.regex).slice(1);
    const params = Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]]));
    const query = Object.fromEntries(new URLSearchParams(search));

    if (match.middleware) {
      const allowed = await match.middleware(params, Lego.globals);
      if (!allowed) return;
    }

    // Only update globals if not already initialized (during navigation, not init)
    const shouldUpdateGlobals = Lego.globals.$route.url !== path + search;

    if (shouldUpdateGlobals) {
      Lego.globals.$route.url = path + search;
      Lego.globals.$route.route = match.path;
      Lego.globals.$route.params = params;
      Lego.globals.$route.query = query;
      Lego.globals.$route.method = history.state?.method || 'GET';
      Lego.globals.$route.body = history.state?.body || null;
    }

    resolvedElements.forEach(el => {
      if (el) {
        const block = document.createElement(match.tagName);
        // Atomic swap: MutationObserver in init() will pick this up
        el.replaceChildren(block);
      }
    });
  };

  // $db Factory
  const dbFactory = (key) => ({
    __type: 'lego-db',
    key,
    _default: undefined,
    _debounce: 0,
    default(v) { this._default = v; return this; },
    debounce(ms) { this._debounce = ms; return this; }
  });

  const publicAPI = {
    db: dbFactory,
    snap,
    unsnap,
    init: async (root = document.body, options = {}) => {
      if (!root || typeof root.nodeType !== 'number') root = document.body;
      styleConfig = options.styles || {};
      config.loader = options.loader; // Register loader hook
      if (options.debug !== true) config.debug = options.debug;

      // Pre-load all defined style sets into Constructable Stylesheets
      const loadPromises = Object.entries(styleConfig).map(async ([key, urls]) => {
        const sheets = await Promise.all(urls.map(async (url) => {
          try {
            const response = await fetch(url);
            const cssText = await response.text();
            const sheet = new CSSStyleSheet();
            await sheet.replace(cssText);
            return sheet;
          } catch (e) {
            console.error(`[Lego] Failed to load stylesheet: ${url}`, e);
            return null;
          }
        }));
        styleRegistry.set(key, sheets.filter(s => s !== null));
      });
      await Promise.all(loadPromises);

      // Initialize route BEFORE scanning DOM to prevent double render
      if (routes.length > 0) {
        const path = window.location.pathname;
        const search = window.location.search;
        const match = routes.find(r => r.regex.test(path));
        if (match) {
          const values = path.match(match.regex).slice(1);
          const params = Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]]));
          const query = Object.fromEntries(new URLSearchParams(search));

          Lego.globals.$route.url = path + search;
          Lego.globals.$route.route = match.path;
          Lego.globals.$route.params = params;
          Lego.globals.$route.query = query;
          Lego.globals.$route.method = 'GET';
          Lego.globals.$route.body = null;
        }
      }

      document.querySelectorAll('template[b-id]').forEach(t => {
        registry[t.getAttribute('b-id')] = t;
      });

      const checkAndLoad = (n) => {
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        snap(n);
        // Auto-Discovery: Check if tag is unknown and loader is configured
        const tagName = n.tagName.toLowerCase();
        if (tagName.includes('-') && !registry[tagName] && config.loader && !activeBlocks.has(n)) {
          const result = config.loader(tagName);
          if (result) {
            const promise = (typeof result === 'string')
              ? fetch(result).then(r => r.text())
              : result;

            Promise.resolve(promise)
              .then(legoFile => publicAPI.defineLegoFile(legoFile, tagName + '.lego'))
              .catch(e => console.error(`[Lego] Failed to load ${tagName}:`, e));
          }
        }
      };

      const observer = new MutationObserver(m => m.forEach(r => {
        r.addedNodes.forEach(checkAndLoad);
        r.removedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && unsnap(n));
      }));
      observer.observe(root, { childList: true, subtree: true });

      // Initial Scan for everything
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
      checkAndLoad(root);
      while (walker.nextNode()) checkAndLoad(walker.currentNode);

      root._studs = Lego.globals;
      // snap(root); // parsing moved to checkAndLoad
      bind(root, root);
      render(root);

      if (options.studio) {
        if (!registry['lego-studio']) {
          const script = document.createElement('script');
          script.src = 'https://unpkg.com/@legodom/studio@0.0.2/dist/lego-studio.js';
          script.onerror = () => console.warn('[Lego] Failed to load Studio from CDN');
          document.head.appendChild(script);
        }
        Lego.route('/_/studio', 'lego-studio');
        Lego.route('/_/studio/:block', 'lego-studio');
      }

      if (routes.length > 0) {
        // Smart History: Restore surgical targets on Back button
        window.addEventListener('popstate', (event) => {
          const targets = event.state?.legoTargets || null;
          _matchRoute(targets);
        });

        document.addEventListener('submit', e => {
          e.preventDefault();
        })

        document.addEventListener('click', e => {
          const path = e.composedPath();
          const link = path.find(el => el.tagName === 'A' && (el.hasAttribute('b-target') || el.hasAttribute('b-link')));
          if (link) {
            e.preventDefault();
            const href = link.getAttribute('href');
            const targetAttr = link.getAttribute('b-target');
            const targets = targetAttr ? targetAttr.split(/\s+/).filter(Boolean) : [];

            const shouldPush = link.getAttribute('b-link') !== 'false';
            Lego.globals.$go(href, ...targets).get(shouldPush);
          }
        });
        _matchRoute();
      }
    },
    globals: reactive({
      $route: {
        url: typeof window !== 'undefined' ? window.location.pathname : '/',
        route: '',
        params: {},
        query: {},
        method: 'GET',
        body: null
      },
      $go: (path, ...targets) => _go(path, ...targets)(document.body),
      $db: dbFactory
    }, typeof document !== 'undefined' ? document.body : null),
    defineLegoFile: (content, filename = 'block.lego') => {
      let template = '';
      let script = '{}';
      let stylesAttr = '';
      let cascadeAttr = '';
      let errorAttr = '';
      let style = '';

      let remaining = content;
      // Robust regex from parse-lego.js
      const startTagRegex = /<(template|script|style)\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;

      while (remaining) {
        const match = remaining.match(startTagRegex);
        if (!match) break;

        const tagName = match[1].toLowerCase();
        const attrs = match[2];
        const fullMatch = match[0];
        const startIndex = match.index;

        const closeTag = `</${tagName}>`;
        const contentStart = startIndex + fullMatch.length;
        const contentEnd = remaining.indexOf(closeTag, contentStart);

        if (contentEnd === -1) {
          console.warn(`[Lego] Unclosed <${tagName}> tag in ${filename}`);
          break;
        }

        const innerContent = remaining.slice(contentStart, contentEnd);

        if (tagName === 'template') {
          template = innerContent.trim();
          const bStylesMatch = attrs.match(/b-stylesheets=["']([^"']+)["']/);
          if (bStylesMatch) stylesAttr = bStylesMatch[1];
          const bCascadeMatch = attrs.match(/b-cascade=["']([^"']+)["']/);
          if (bCascadeMatch) cascadeAttr = bCascadeMatch[1];
          const bErrorMatch = attrs.match(/b-error=["']([^"']+)["']/);
          if (bErrorMatch) errorAttr = bErrorMatch[1];
        } else if (tagName === 'script') {
          // Extract logic from script
          const logic = innerContent.trim();
          const defaultExport = logic.match(/export\s+default\s+({[\s\S]*})/);
          script = defaultExport ? defaultExport[1] : logic;
        } else if (tagName === 'style') {
          style = innerContent.trim();
        }

        remaining = remaining.slice(contentEnd + closeTag.length);
      }

      const name = deriveBlockName(filename);
      // Inject $db helper into the scope
      let logicObj = {};
      try {
        logicObj = new Function('Lego', '$db', `return ${script}`)(Lego, Lego.globals.$db);
      } catch (e) {
        config.onError(e, 'script', name);
      }

      if (style) {
        template = `<style>${style}</style>` + template;
      }

      registry[name] = document.createElement('template');
      registry[name].innerHTML = template;
      registry[name].setAttribute('b-stylesheets', stylesAttr);
      if (cascadeAttr) {
        registry[name].setAttribute('b-cascade', cascadeAttr);
      }
      if (errorAttr) {
        registry[name].setAttribute('b-error', errorAttr);
      }
      legoFileLogic.set(name, logicObj);

      // Upgrade existing elements
      document.querySelectorAll(name).forEach(el => !getPrivateData(el).snapped && snap(el));
    },
    block: (tagName, templateHTML, logic = {}, styles = "", cascade = "", error = "") => {
      const t = document.createElement('template');
      t.setAttribute('b-id', tagName);
      t.setAttribute('b-stylesheets', styles);
      if (cascade) t.setAttribute('b-cascade', cascade);
      if (error) t.setAttribute('b-error', error);
      t.innerHTML = templateHTML;
      registry[tagName] = t;
      legoFileLogic.set(tagName, logic);

      // Initialize shared state with try-catch safety
      // Initialize shared state with try-catch safety
      try {
        const sharedState = {};
        mergeDescriptors(logic, sharedState);
        sharedStates.set(tagName.toLowerCase(), reactive(sharedState, document.body));
      } catch (e) {
        config.onError(e, 'define', tagName);
      }

      document.querySelectorAll(tagName).forEach(snap);

      // Also scan inside all shadow roots for late-registered components
      activeBlocks.forEach(block => {
        if (block._legoShadow) {
          block._legoShadow.querySelectorAll(tagName).forEach(instance => {
            if (!getPrivateData(instance).snapped) {
              if (config.debug) console.log('[Lego Debug] Lazy-initializing', tagName, 'in', block.tagName);
              snap(instance);
            }
          });
        }
      });
    },


    // For specific test validation
    getActiveBlocksCount: () => activeBlocks.size,
    getLegos: () => Object.keys(registry),
    config, // Expose config for customization
    route: (path, tagName, middleware = null) => {
      const paramNames = [];
      const regexPath = path.replace(/:([^\/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      routes.push({ path, regex: new RegExp(`^${regexPath}$`), tagName, paramNames, middleware });
    },
    debug: {
      stylesheets: (el) => {
        if (!el || !el._studsMeta) return null;
        return el._studsMeta.stylesheets;
      }
    }
  };

  return publicAPI;
})();

if (typeof window !== 'undefined') {
  window.Lego = Lego;
} else if (typeof global !== 'undefined') {
  global.Lego = Lego;
}
