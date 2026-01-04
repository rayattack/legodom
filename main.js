const Lego = (() => {
  const registry = {}, proxyCache = new WeakMap(), privateData = new WeakMap();

  const createBatcher = () => {
    let queued = false;
    const callbacks = new Set();
    return {
      add: (cb) => {
        callbacks.add(cb);
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
          const cbs = Array.from(callbacks);
          callbacks.clear();
          queued = false;
          cbs.forEach(fn => fn());
        });
      }
    };
  };

  const reactive = (obj, cb, batcher = null) => {
    if (obj === null || typeof obj !== 'object') return obj;
    if (proxyCache.has(obj)) return proxyCache.get(obj);
    if (!batcher) batcher = createBatcher();

    const handler = {
      get: (t, k) => {
        const val = Reflect.get(t, k);
        if (Array.isArray(t) && typeof val === 'function') {
          const methods = ['push', 'pop', 'splice', 'shift', 'unshift', 'reverse', 'sort'];
          if (methods.includes(k)) {
            return (...args) => {
              const result = val.apply(t, args);
              batcher.add(cb);
              return result;
            };
          }
        }
        return reactive(val, cb, batcher);
      },
      set: (t, k, v) => {
        const r = Reflect.set(t, k, v);
        batcher.add(cb);
        return r;
      },
      deleteProperty: (t, k) => {
        const r = Reflect.deleteProperty(t, k);
        batcher.add(cb);
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
      console.error(`[Lego] Failed to parse l-studs:`, raw, e);
      return {};
    }
  };

  const getPrivateData = (el) => {
    if (!privateData.has(el)) {
      privateData.set(el, { snapped: false, bindings: null });
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
      // We wrap in a function that uses the reactive proxy as 'this'
      const func = new Function('global', 'self', 'event', `with(this) { try { return ${expr} } catch(e) { return undefined; } }`);
      const result = func.call(scope, context.global, context.self, context.event);
      
      // THE FIX: If the result is a function (like an arrow function), call it immediately
      if (typeof result === 'function') {
        return result.call(scope, context.event);
      }
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
    container.querySelectorAll('[\\@click], [l-model]').forEach(child => {
      if (!loopCtx && child.closest('[l-for]') && child.closest('[l-for]') !== container) return;

      const childData = getPrivateData(child);
      
      if (child.hasAttribute('@click') && !childData.clickBound) {
        childData.clickBound = true;
        child.addEventListener('click', (event) => {
          let evalScope = state;
          if (loopCtx) {
            const list = resolve(loopCtx.listName, state);
            const item = list[loopCtx.index] || {};
            // Create a temporary scope that includes the loop item
            evalScope = Object.assign(Object.create(state), { [loopCtx.name]: item });
          }
          safeEval(child.getAttribute('@click'), { state: evalScope, global: Lego.globals, self: child, event });
        });
      }

      if (child.hasAttribute('l-model') && !childData.modelBound) {
        childData.modelBound = true;
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
          if (target && target[last] !== newVal) target[last] = newVal;
        };
        child.addEventListener('input', updateState);
        child.addEventListener('change', updateState);
      }
    });
  };

  const scanForBindings = (container) => {
    const bindings = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      const isInsideFor = (n) => {
        let p = n.parentNode;
        while(p && p !== container) {
          if (p.hasAttribute && p.hasAttribute('l-for')) return true;
          p = p.parentNode;
        }
        return false;
      };
      if (isInsideFor(node)) continue;

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

  const render = (el) => {
    if (!el._studs) return;
    const data = getPrivateData(el);
    const shadow = el.shadowRoot;
    if (!shadow) return;

    if (!data.bindings) data.bindings = scanForBindings(shadow);
    const state = el._studs;

    data.bindings.forEach(b => {
      if (b.type === 'l-if') b.node.style.display = safeEval(b.expr, { state }) ? '' : 'none';
      if (b.type === 'l-text') b.node.textContent = resolve(b.path, state);
      
      if (b.type === 'l-model') {
        const val = resolve(b.node.getAttribute('l-model'), state);
        syncModelValue(b.node, val);
      }
      
      if (b.type === 'text') {
        const out = b.template.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state }) ?? '');
        if (b.node.textContent !== out) b.node.textContent = out;
      }
      
      if (b.type === 'attr') {
        const out = b.template.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state }) ?? '');
        if (b.node.getAttribute(b.attrName) !== out) b.node.setAttribute(b.attrName, out);
      }

      if (b.type === 'l-for') {
        const list = resolve(b.listName, state) || [];
        if (b.node.children.length !== list.length) {
          b.node.innerHTML = list.map(() => b.template).join('');
        }

        Array.from(b.node.children).forEach((child, i) => {
          const item = list[i];
          if (!item) return;
          
          const localScope = Object.assign(Object.create(state), { [b.itemName]: item });
          const loopInfo = { name: b.itemName, listName: b.listName, index: i };
          
          const walker = document.createTreeWalker(child, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
          let n;
          while (n = walker.nextNode()) {
            if (n.nodeType === 3) {
              if (n._tpl === undefined) n._tpl = n.textContent;
              if (n._tpl.includes('{{')) {
                const out = n._tpl.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state: localScope }) ?? '');
                if (n.textContent !== out) n.textContent = out;
              }
            } else if (n.nodeType === 1) {
              [...n.attributes].forEach(attr => {
                if (attr._tpl === undefined) attr._tpl = attr.value;
                if (attr._tpl.includes('{{')) {
                  const out = attr._tpl.replace(/{{(.*?)}}/g, (_, k) => safeEval(k.trim(), { state: localScope }) ?? '');
                  if (attr.value !== out) attr.value = out;
                }
              });
              if (n.hasAttribute('l-model')) {
                const prop = n.getAttribute('l-model');
                const val = prop.startsWith(b.itemName + '.') 
                  ? resolve(prop.split('.').slice(1).join('.'), item)
                  : resolve(prop, state);
                syncModelValue(n, val);
              }
            }
          }
          bind(child, el, loopInfo);
        });
      }
    });
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
      
      el._studs = reactive(initialState, () => render(el));
      shadow.appendChild(tpl);
      const style = shadow.querySelector('style');
      if (style) style.textContent = style.textContent.replace(/\bself\b/g, ':host');
      
      bind(shadow, el);
      render(el);
    }
    [...el.children].forEach(snap);
  };

  return {
    init: () => {
      document.querySelectorAll('template[lego-block]').forEach(t => registry[t.getAttribute('lego-block')] = t);
      const observer = new MutationObserver(m => m.forEach(r => r.addedNodes.forEach(snap)));
      observer.observe(document.body, { childList: true, subtree: true });
      snap(document.body);
    },
    globals: reactive({}, () => document.querySelectorAll('*').forEach(el => el._studs && render(el)))
  };
})();

document.addEventListener('DOMContentLoaded', Lego.init);
