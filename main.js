const Lego = (() => {
  const registry = {}, proxyCache = new WeakMap(), privateData = new WeakMap();
  const forPools = new WeakMap();
  const activeComponents = new Set();

  const sfcLogic = new Map();
  const sharedStates = new Map();
  const expressionCache = new Map(); // Cache for compiled expressions

  const styleRegistry = new Map();
  let styleConfig = {};

  const routes = [];

  const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
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
    // Scoped search first (within the calling component), then global fallback
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
    const componentsToUpdate = new Set();
    let isProcessing = false;

    return {
      add: (el) => {
        if (!el || isProcessing) return;
        componentsToUpdate.add(el);
        if (queued) return;
        queued = true;

        requestAnimationFrame(() => {
          isProcessing = true;
          const batch = Array.from(componentsToUpdate);
          componentsToUpdate.clear();
          queued = false;

          batch.forEach(el => render(el));

          setTimeout(() => {
            batch.forEach(el => {
              const state = el._studs;
              if (state && typeof state.updated === 'function') {
                try {
                  state.updated.call(state);
                } catch (e) {
                  console.error(`[Lego] Error in updated hook:`, e);
                }
              }
            });
            isProcessing = false;
          }, 0);
        });
      }
    };
  };

  const globalBatcher = createBatcher();

  const reactive = (obj, el, batcher = globalBatcher) => {
    if (obj === null || typeof obj !== 'object' || obj instanceof Node) return obj;
    if (proxyCache.has(obj)) return proxyCache.get(obj);

    const handler = {
      get: (t, k) => {
        const val = Reflect.get(t, k);
        if (val !== null && typeof val === 'object' && !(val instanceof Node)) {
          return reactive(val, el, batcher);
        }
        return val;
      },
      set: (t, k, v) => {
        const old = t[k];
        const r = Reflect.set(t, k, v);
        if (old !== v) batcher.add(el);
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

  const parseJSObject = (raw) => {
    try {
      return (new Function(`return (${raw})`))();
    } catch (e) {
      console.error(`[Lego] Failed to parse b-data:`, raw, e);
      return {};
    }
  };

  const getPrivateData = (el) => {
    if (!privateData.has(el)) {
      privateData.set(el, { snapped: false, bindings: null, bound: false, rendering: false, anchor: null, hasGlobalDependency: false });
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

  const findAncestorState = (el, tagName) => {
    let parent = el.parentElement || el.getRootNode().host;
    while (parent) {
      if (parent.tagName && parent.tagName.toLowerCase() === tagName.toLowerCase()) {
        return parent._studs;
      }
      parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
    }
    return undefined;
  };

  const safeEval = (expr, context) => {
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
        func = new Function('global', 'self', 'event', 'helpers', `
          with(helpers) {
            with(this) { 
              try { return ${expr} } catch(e) { return undefined; } 
            }
          }
        `);
        expressionCache.set(expr, func);
      }

      const helpers = {
        $ancestors: (tag) => findAncestorState(context.self, tag),
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

  const bind = (container, componentRoot, loopCtx = null) => {
    const state = componentRoot._studs;
    const elements = container instanceof Element ? [container, ...container.querySelectorAll('*')] : container.querySelectorAll('*');

    elements.forEach(child => {
      const childData = getPrivateData(child);
      if (childData.bound) return;

      [...child.attributes].forEach(attr => {
        if (attr.name.startsWith('@')) {
          const eventName = attr.name.slice(1);
          child.addEventListener(eventName, (event) => {
            let evalScope = state;
            if (loopCtx) {
              const list = safeEval(loopCtx.listName, { state, global: Lego.globals, self: componentRoot });
              const item = list[loopCtx.index];
              evalScope = Object.assign(Object.create(state), { [loopCtx.name]: item });
            }
            safeEval(attr.value, { state: evalScope, global: Lego.globals, self: child, event });
          });
        }
      });

      if (child.hasAttribute('b-sync')) {
        const prop = child.getAttribute('b-sync');
        const updateState = () => {
          let target, last;
          if (loopCtx && prop.startsWith(loopCtx.name + '.')) {
            const list = safeEval(loopCtx.listName, { state, global: Lego.globals, self: componentRoot });
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
        };
        child.addEventListener('input', updateState);
        child.addEventListener('change', updateState);
      }
      childData.bound = true;
    });
  };

  const scanForBindings = (container) => {
    const bindings = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const isInsideBoundary = (n) => {
        let curr = n.parentNode;
        while (curr && curr !== container) {
          if (curr.hasAttribute && curr.hasAttribute('b-for')) return true;
          // Only stop at Shadow Roots or explicit boundaries, NOT component tags in Light DOM
          // The parent MUST be able to bind data to the slots of its children.
          curr = curr.parentNode;
        }
        return false;
      };
      if (isInsideBoundary(node)) continue;

      const checkGlobal = (str) => {
        if (/\bglobal\b/.test(str)) {
          const target = container.host || container;
          getPrivateData(target).hasGlobalDependency = true;
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
          const match = node.getAttribute('b-for').match(/^\s*(\w+)\s+in\s+(.+)\s*$/);
          if (match) {
            checkGlobal(match[2]);
            bindings.push({
              type: 'b-for',
              node,
              itemName: match[1],
              listName: match[2].trim(),
              template: node.innerHTML
            });
            node.innerHTML = '';
          }
        }
        if (node.hasAttribute('b-text')) bindings.push({ type: 'b-text', node, path: node.getAttribute('b-text') });
        if (node.hasAttribute('b-html')) {
          const expr = node.getAttribute('b-html');
          checkGlobal(expr);
          bindings.push({ type: 'b-html', node, expr });
        }
        if (node.hasAttribute('b-sync')) bindings.push({ type: 'b-sync', node });
        [...node.attributes].forEach(attr => {
          if (attr.value.includes('{{')) {
            checkGlobal(attr.value);
            bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
          }
        });
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('{{')) {
        checkGlobal(node.textContent);
        bindings.push({ type: 'text', node, template: node.textContent });
      }
    }
    return bindings;
  };

  const updateNodeBindings = (root, scope) => {
    const processNode = (node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node._tpl === undefined) node._tpl = node.textContent;
        const out = node._tpl.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state: scope, global: Lego.globals, self: node }) ?? '');
        if (node.textContent !== out) node.textContent = out;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        [...node.attributes].forEach(attr => {
          if (attr._tpl === undefined) attr._tpl = attr.value;
          if (attr._tpl.includes('{{')) {
            const out = attr._tpl.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state: scope, global: Lego.globals, self: node }) ?? '');
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
    const state = el._studs;
    if (!state) return;
    const data = getPrivateData(el);
    if (data.rendering) return;
    data.rendering = true;

    try {
      // Use shadowRoot if it's a component, otherwise render the element itself (light DOM)
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
          const out = b.template.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state, global: Lego.globals, self: b.node }) ?? '');
          if (b.node.textContent !== out) b.node.textContent = out;
        }
        if (b.type === 'attr') {
          const out = b.template.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state, global: Lego.globals, self: b.node }) ?? '');
          if (b.node.getAttribute(b.attrName) !== out) {
            b.node.setAttribute(b.attrName, out);
            if (b.attrName === 'class') b.node.className = out;
          }
        }
        if (b.type === 'b-for') {
          const list = safeEval(b.listName, { state, global: Lego.globals, self: el }) || [];
          if (!forPools.has(b.node)) forPools.set(b.node, new Map());
          const pool = forPools.get(b.node);
          const currentKeys = new Set();
          list.forEach((item, i) => {
            const key = (item && typeof item === 'object') ? (item.__id || (item.__id = Math.random())) : `${i}-${item}`;
            currentKeys.add(key);
            let child = pool.get(key);
            if (!child) {
              const temp = document.createElement('div');
              temp.innerHTML = b.template;
              child = temp.firstElementChild;
              pool.set(key, child);
              bind(child, el, { name: b.itemName, listName: b.listName, index: i });
            }
            const localScope = Object.assign(Object.create(state), { [b.itemName]: item });
            updateNodeBindings(child, localScope);

            child.querySelectorAll('[b-sync]').forEach(input => {
              const path = input.getAttribute('b-sync');
              if (path.startsWith(b.itemName + '.')) {
                const list = safeEval(b.listName, { state, global: Lego.globals, self: el });
                syncModelValue(input, resolve(path.split('.').slice(1).join('.'), list[i]));
              }
            });
            if (b.node.children[i] !== child) b.node.insertBefore(child, b.node.children[i] || null);
          });
          for (const [key, node] of pool.entries()) {
            if (!currentKeys.has(key)) { node.remove(); pool.delete(key); }
          }
        }
      });

      // Global Broadcast: Only notify components that depend on globals
      if (state === Lego.globals) {
        activeComponents.forEach(comp => {
          if (getPrivateData(comp).hasGlobalDependency) render(comp);
        });
      }
    } finally {
      data.rendering = false;
    }
  };

  const snap = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
    const data = getPrivateData(el);
    const name = el.tagName.toLowerCase();
    const templateNode = registry[name];

    if (templateNode && !data.snapped) {
      data.snapped = true;
      const tpl = templateNode.content.cloneNode(true);
      const shadow = el.attachShadow({ mode: 'open' });

      const styleKeys = (templateNode.getAttribute('b-styles') || "").split(/\s+/).filter(Boolean);
      if (styleKeys.length > 0) {
        const sheetsToApply = styleKeys.flatMap(key => styleRegistry.get(key) || []);
        if (sheetsToApply.length > 0) {
          shadow.adoptedStyleSheets = [...sheetsToApply];
        }
      }

      // TIER 1: Logic from Lego.define (SFC)
      // TIER 2: Logic from the <template b-data="..."> attribute
      // TIER 3: Logic from the <my-comp b-data="..."> tag
      const scriptLogic = sfcLogic.get(name) || {};
      const templateLogic = parseJSObject(templateNode.getAttribute('b-data') || '{}');
      const instanceLogic = parseJSObject(el.getAttribute('b-data') || '{}');

      // Priority: Script < Template < Instance
      el._studs = reactive({
        ...scriptLogic,
        ...templateLogic,
        ...instanceLogic,
        get $route() { return Lego.globals.$route },
        get $go() { return Lego.globals.$go }
      }, el);

      shadow.appendChild(tpl);

      const style = shadow.querySelector('style');
      if (style) {
        style.textContent = style.textContent.replace(/\bself\b/g, ':host');
      }

      bind(shadow, el);
      activeComponents.add(el);
      render(el);

      if (typeof el._studs.mounted === 'function') {
        try { el._studs.mounted.call(el._studs); } catch (e) { console.error(`[Lego] Error in mounted <${name}>:`, e); }
      }
    }

    let provider = el.parentElement;
    while (provider && !provider._studs) provider = provider.parentElement;
    if (provider && provider._studs) bind(el, provider);

    [...el.children].forEach(snap);
  };

  const unsnap = (el) => {
    if (el._studs && typeof el._studs.unmounted === 'function') {
      try { el._studs.unmounted.call(el._studs); } catch (e) { console.error(`[Lego] Error in unmounted:`, e); }
    }
    activeComponents.delete(el);
    [...el.children].forEach(unsnap);
  };

  const _matchRoute = async (targetQueries = null, contextEl = null) => {
    const path = window.location.pathname;
    const search = window.location.search;
    const match = routes.find(r => r.regex.test(path));
    if (!match) return;

    // Resolve targets: Functional selectors > List of queries > History State > Default lego-router
    let resolvedElements = [];
    if (targetQueries) {
      resolvedElements = targetQueries.flatMap(query => resolveTargets(query, contextEl));
    } else {
      const defaultOutlet = document.querySelector('lego-router');
      if (defaultOutlet) resolvedElements = [defaultOutlet];
    }

    if (resolvedElements.length === 0) return;

    const values = path.match(match.regex).slice(1);
    const params = Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]]));
    const query = Object.fromEntries(new URLSearchParams(search));

    if (match.middleware) {
      const allowed = await match.middleware(params, Lego.globals);
      if (!allowed) return;
    }

    Lego.globals.$route.url = path + search;
    Lego.globals.$route.route = match.path;
    Lego.globals.$route.params = params;
    Lego.globals.$route.query = query;
    Lego.globals.$route.method = history.state?.method || 'GET';
    Lego.globals.$route.body = history.state?.body || null;

    resolvedElements.forEach(el => {
      if (el) {
        const component = document.createElement(match.tagName);
        // Atomic swap: MutationObserver in init() will pick this up
        el.replaceChildren(component);
      }
    });
  };

  return {
    init: async (root = document.body, styles = {}) => {
      // If called as an event listener or with invalid root, fail over to document.body
      if (!root || typeof root.nodeType !== 'number') root = document.body;
      styleConfig = styles;

      // Pre-load all defined style sets into Constructable Stylesheets
      const loadPromises = Object.entries(styles).map(async ([key, urls]) => {
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

      document.querySelectorAll('template[b-id]').forEach(t => {
        registry[t.getAttribute('b-id')] = t;
      });

      const observer = new MutationObserver(m => m.forEach(r => {
        r.addedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && snap(n));
        r.removedNodes.forEach(n => n.nodeType === Node.ELEMENT_NODE && unsnap(n));
      }));
      observer.observe(root, { childList: true, subtree: true });

      root._studs = Lego.globals;
      snap(root);
      bind(root, root);
      render(root);

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
        url: window.location.pathname,
        route: '',
        params: {},
        query: {},
        method: 'GET',
        body: null
      },
      $go: (path, ...targets) => _go(path, ...targets)(document.body)
    }, document.body),
    define: (tagName, templateHTML, logic = {}, styles = "") => {
      const t = document.createElement('template');
      t.setAttribute('b-id', tagName);
      t.setAttribute('b-styles', styles);
      t.innerHTML = templateHTML;
      registry[tagName] = t;
      sfcLogic.set(tagName, logic);

      sharedStates.set(tagName.toLowerCase(), reactive({ ...logic }, document.body));

      document.querySelectorAll(tagName).forEach(snap);
    },
    route: (path, tagName, middleware = null) => {
      const paramNames = [];
      const regexPath = path.replace(/:([^\/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      routes.push({ path, regex: new RegExp(`^${regexPath}$`), tagName, paramNames, middleware });
    }
  };
})();

if (typeof window !== 'undefined') {
  window.Lego = Lego;
}
