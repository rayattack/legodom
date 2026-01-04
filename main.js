/**
 * Lego JS - A tiny, reactive component library.
 * Designed for rapid prototyping with a focus on ease-of-use.
 */
const Lego = (() => {
  const registry = {}, proxyCache = new WeakMap(), privateData = new WeakMap();
  const forPools = new WeakMap();

  // Utility to prevent XSS in text interpolations
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
                  console.error(`[Lego] Error in updated hook for <${el.tagName.toLowerCase()}>:`, e);
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
        if (old !== v) {
          batcher.add(el);
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

  const parseJSObject = (raw) => {
    try {
      // Basic check for obvious malicious patterns
      if (raw.includes('window.') || raw.includes('document.') || raw.includes('fetch')) {
        console.warn('[Lego Security] Potentially unsafe l-studs detected.');
      }
      return (new Function(`return (${raw})`))();
    } catch (e) {
      console.error(`[Lego] Failed to parse l-studs:`, raw, e);
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

  const safeEval = (expr, context) => {
    try {
      const scope = context.state || {};
      // Wrap expression to prevent access to sensitive globals if possible
      const func = new Function('global', 'self', 'event', `with(this) { try { return ${expr} } catch(e) { return undefined; } }`);
      const result = func.call(scope, context.global, context.self, context.event);
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
    const elements = container.querySelectorAll('[\\@click], [l-model]');
    
    elements.forEach(child => {
      const childData = getPrivateData(child);
      if (childData.bound) return; 

      if (child.hasAttribute('@click')) {
        child.addEventListener('click', (event) => {
          let evalScope = state;
          if (loopCtx) {
            const list = resolve(loopCtx.listName, state);
            const item = list[loopCtx.index];
            evalScope = Object.assign(Object.create(state), { [loopCtx.name]: item });
          }
          safeEval(child.getAttribute('@click'), { state: evalScope, global: Lego.globals, self: child, event });
        });
      }

      if (child.hasAttribute('l-model')) {
        const prop = child.getAttribute('l-model');
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
          if (target && target[last] !== newVal) {
            target[last] = newVal;
          }
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
      const isInsideLFor = (n) => {
        let curr = n.parentNode;
        while (curr && curr !== container) {
          if (curr.hasAttribute && curr.hasAttribute('l-for')) return true;
          curr = curr.parentNode;
        }
        return false;
      };
      if (isInsideLFor(node)) continue;

      if (node.nodeType === 1) {
        if (node.hasAttribute('l-if')) bindings.push({ type: 'l-if', node, expr: node.getAttribute('l-if') });
        if (node.hasAttribute('l-for')) {
          const match = node.getAttribute('l-for').match(/^\s*(\w+)\s+in\s+(.+)\s*$/);
          if (match) {
            bindings.push({ 
              type: 'l-for', 
              node, 
              itemName: match[1], 
              listName: match[2].trim(), 
              template: node.innerHTML 
            });
            node.innerHTML = ''; 
          }
        }
        if (node.hasAttribute('l-text')) bindings.push({ type: 'l-text', node, path: node.getAttribute('l-text') });
        if (node.hasAttribute('l-model')) bindings.push({ type: 'l-model', node });
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
        const out = node._tpl.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state: scope }) ?? ''));
        if (node.textContent !== out) node.textContent = out;
      } else if (node.nodeType === 1) {
        [...node.attributes].forEach(attr => {
          if (attr._tpl === undefined) attr._tpl = attr.value;
          if (attr._tpl.includes('{{')) {
            const out = attr._tpl.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state: scope }) ?? ''));
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
        if (b.type === 'l-if') b.node.style.display = safeEval(b.expr, { state }) ? '' : 'none';
        if (b.type === 'l-text') b.node.textContent = escapeHTML(resolve(b.path, state));
        if (b.type === 'l-model') syncModelValue(b.node, resolve(b.node.getAttribute('l-model'), state));
        if (b.type === 'text') {
          const out = b.template.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state }) ?? ''));
          if (b.node.textContent !== out) b.node.textContent = out;
        }
        if (b.type === 'attr') {
          const out = b.template.replace(/{{(.*?)}}/g, (_, k) => escapeHTML(safeEval(k.trim(), { state }) ?? ''));
          if (b.node.getAttribute(b.attrName) !== out) {
            b.node.setAttribute(b.attrName, out);
            if (b.attrName === 'class') b.node.className = out;
          }
        }
        if (b.type === 'l-for') {
          const list = resolve(b.listName, state) || [];
          if (!forPools.has(b.node)) forPools.set(b.node, new Map());
          const pool = forPools.get(b.node);
          const currentItems = new Set();
          list.forEach((item, i) => {
            const key = (item && typeof item === 'object') ? (item.__id || (item.__id = Math.random())) : `${i}-${item}`;
            currentItems.add(key);
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
            child.querySelectorAll('[l-model]').forEach(input => {
              const path = input.getAttribute('l-model');
              syncModelValue(input, path.startsWith(b.itemName + '.') ? resolve(path.split('.').slice(1).join('.'), item) : resolve(path, state));
            });
            if (b.node.children[i] !== child) b.node.insertBefore(child, b.node.children[i] || null);
          });
          for (const [key, node] of pool.entries()) {
            if (!currentItems.has(key)) { node.remove(); pool.delete(key); }
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
      const initialState = parseJSObject(el.getAttribute('l-studs') || '{}');
      el._studs = reactive(initialState, el);
      shadow.appendChild(tpl);
      const style = shadow.querySelector('style');
      if (style) style.textContent = style.textContent.replace(/\bself\b/g, ':host');
      bind(shadow, el);
      render(el);
      if (typeof el._studs.mounted === 'function') el._studs.mounted.call(el._studs);
    }
    [...el.children].forEach(snap);
  };

  const unsnap = (el) => {
    if (el._studs && typeof el._studs.unmounted === 'function') el._studs.unmounted.call(el._studs);
    [...el.children].forEach(unsnap);
  };

  return {
    init: () => {
      document.querySelectorAll('template[lego-block]').forEach(t => registry[t.getAttribute('lego-block')] = t);
      const observer = new MutationObserver(m => m.forEach(r => { r.addedNodes.forEach(snap); r.removedNodes.forEach(unsnap); }));
      observer.observe(document.body, { childList: true, subtree: true });
      snap(document.body);
    },
    globals: reactive({}, document.body),
    // Method to manually define a component via JS
    define: (tagName, templateHTML) => {
      const t = document.createElement('template');
      t.setAttribute('lego-block', tagName);
      t.innerHTML = templateHTML;
      registry[tagName] = t;
    }
  };
})();

// Auto-init for browser usage
if (typeof window !== 'undefined') {
  document.addEventListener('DOMContentLoaded', Lego.init);
  window.Lego = Lego;
}
