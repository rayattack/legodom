const Lego = (() => {
  const registry = {}, proxyCache = new WeakMap(), privateData = new WeakMap();
  const forPools = new WeakMap();

  const sfcLogic = new Map();
  const sharedStates = new Map(); // Track singleton states for $registry
  const routes = [];

  const escapeHTML = (str) => {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
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
      privateData.set(el, { snapped: false, bindings: null, bound: false, rendering: false });
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
    try {
      const scope = context.state || {};

      const helpers = {
        $ancestors: (tag) => findAncestorState(context.self, tag),
        // Helper to access shared state by tag name
        $registry: (tag) => sharedStates.get(tag.toLowerCase()),
        $element: context.self,
        $emit: (name, detail) => {
          context.self.dispatchEvent(new CustomEvent(name, {
            detail,
            bubbles: true,
            composed: true
          }));
        }
      };

      const func = new Function('global', 'self', 'event', 'helpers', `
        with(helpers) {
          with(this) { 
            try { return ${expr} } catch(e) { return undefined; } 
          }
        }
      `);

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
              const list = resolve(loopCtx.listName, state);
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
            const list = resolve(loopCtx.listName, state);
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
      const isInsideBFor = (n) => {
        let curr = n.parentNode;
        while (curr && curr !== container) {
          if (curr.hasAttribute && curr.hasAttribute('b-for')) return true;
          if (curr.tagName && curr.tagName.includes('-') && registry[curr.tagName.toLowerCase()]) return true;
          curr = curr.parentNode;
        }
        return false;
      };
      if (isInsideBFor(node)) continue;

      if (node.nodeType === 1) {
        if (node.hasAttribute('b-if')) bindings.push({ type: 'b-if', node, expr: node.getAttribute('b-if') });
        if (node.hasAttribute('b-for')) {
          const match = node.getAttribute('b-for').match(/^\s*(\w+)\s+in\s+(.+)\s*$/);
          if (match) {
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
        if (node.hasAttribute('b-sync')) bindings.push({ type: 'b-sync', node });
        [...node.attributes].forEach(attr => {
          if (attr.value.includes('{{')) bindings.push({ type: 'attr', node, attrName: attr.name, template: attr.value });
        });
      } else if (node.nodeType === 3 && node.textContent.includes('{{')) {
        bindings.push({ type: 'text', node, template: node.textContent });
      }
    }
    return bindings;
  };

  const updateNodeBindings = (root, scope) => {
    const processNode = (node) => {
      if (node.nodeType === 3) {
        if (node._tpl === undefined) node._tpl = node.textContent;
        const out = node._tpl.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state: scope, self: node }) ?? ''));
        if (node.textContent !== out) node.textContent = out;
      } else if (node.nodeType === 1) {
        [...node.attributes].forEach(attr => {
          if (attr._tpl === undefined) attr._tpl = attr.value;
          if (attr._tpl.includes('{{')) {
            const out = attr._tpl.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state: scope, self: node }) ?? ''));
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
      const shadow = el.shadowRoot;
      if (!shadow) return;
      if (!data.bindings) data.bindings = scanForBindings(shadow);

      data.bindings.forEach(b => {
        if (b.type === 'b-if') b.node.style.display = safeEval(b.expr, { state, self: b.node }) ? '' : 'none';
        if (b.type === 'b-text') b.node.textContent = escapeHTML(resolve(b.path, state));
        if (b.type === 'b-sync') syncModelValue(b.node, resolve(b.node.getAttribute('b-sync'), state));
        if (b.type === 'text') {
          const out = b.template.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state, self: b.node }) ?? ''));
          if (b.node.textContent !== out) b.node.textContent = out;
        }
        if (b.type === 'attr') {
          const out = b.template.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state, self: b.node }) ?? ''));
          if (b.node.getAttribute(b.attrName) !== out) {
            b.node.setAttribute(b.attrName, out);
            if (b.attrName === 'class') b.node.className = out;
          }
        }
        if (b.type === 'b-for') {
          const list = resolve(b.listName, state) || [];
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
                syncModelValue(input, resolve(path.split('.').slice(1).join('.'), item));
              }
            });
            if (b.node.children[i] !== child) b.node.insertBefore(child, b.node.children[i] || null);
          });
          for (const [key, node] of pool.entries()) {
            if (!currentKeys.has(key)) { node.remove(); pool.delete(key); }
          }
        }
      });
    } finally {
      data.rendering = false;
    }
  };

  const snap = (el) => {
    if (!el || el.nodeType !== 1) return;
    const data = getPrivateData(el);
    const name = el.tagName.toLowerCase();

    if (registry[name] && !data.snapped) {
      data.snapped = true;
      const tpl = registry[name].content.cloneNode(true);
      const shadow = el.attachShadow({ mode: 'open' });

      const defaultLogic = sfcLogic.get(name) || {};
      const attrLogic = parseJSObject(el.getAttribute('b-data') || '{}');
      el._studs = reactive({ ...defaultLogic, ...attrLogic }, el);

      shadow.appendChild(tpl);

      const style = shadow.querySelector('style');
      if (style) {
        style.textContent = style.textContent.replace(/\bself\b/g, ':host');
      }

      bind(shadow, el);
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
    [...el.children].forEach(unsnap);
  };

  const _matchRoute = async () => {
    const path = window.location.pathname;
    const match = routes.find(r => r.regex.test(path));
    const outlet = document.querySelector('lego-router');
    if (!outlet || !match) return;

    const values = path.match(match.regex).slice(1);
    const params = Object.fromEntries(match.paramNames.map((n, i) => [n, values[i]]));

    if (match.middleware) {
      const allowed = await match.middleware(params, Lego.globals);
      if (!allowed) return;
    }

    Lego.globals.params = params;
    outlet.innerHTML = `<${match.tagName}></${match.tagName}>`;
  };

  return {
    init: () => {
      document.querySelectorAll('template[b-id]').forEach(t => registry[t.getAttribute('b-id')] = t);
      const observer = new MutationObserver(m => m.forEach(r => {
        r.addedNodes.forEach(n => n.nodeType === 1 && snap(n));
        r.removedNodes.forEach(n => n.nodeType === 1 && unsnap(n));
      }));
      observer.observe(document.body, { childList: true, subtree: true });

      // Also snap the root element (body) to catch attributes like @event
      snap(document.body);

      // Bind body specifically to catch global listeners like @todo-added in go.html
      // We pass a mock componentRoot that points to Lego.globals
      bind(document.body, { _studs: Lego.globals, _data: { bound: false } });

      if (routes.length > 0) {
        window.addEventListener('popstate', _matchRoute);
        document.addEventListener('click', e => {
          const link = e.target.closest('a[b-link]');
          if (link) {
            e.preventDefault();
            history.pushState({}, '', link.getAttribute('href'));
            _matchRoute();
          }
        });
        _matchRoute();
      }
    },
    globals: reactive({}, document.body),
    define: (tagName, templateHTML, logic = {}) => {
      const t = document.createElement('template');
      t.setAttribute('b-id', tagName);
      t.innerHTML = templateHTML;
      registry[tagName] = t;
      sfcLogic.set(tagName, logic);

      // Initialize shared state for $registry singleton
      sharedStates.set(tagName.toLowerCase(), reactive({ ...logic }, document.body));

      document.querySelectorAll(tagName).forEach(snap);
    },
    route: (path, tagName, middleware = null) => {
      const paramNames = [];
      const regexPath = path.replace(/:([^\/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      routes.push({ regex: new RegExp(`^${regexPath}$`), tagName, paramNames, middleware });
    }
  };
})();

if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', Lego.init);
  window.Lego = Lego;
}
