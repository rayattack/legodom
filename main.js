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
    return path.trim().split('.').reduce((o, k) => (o || {})[k], obj) ?? '';
  };

  const safeEval = (expr, context) => {
    try {
      const isFunction = expr.includes('=>') || expr.startsWith('function');
      if (isFunction) {
        // For functions, we inject the state keys as variables so they are accessible in the function scope
        const keys = Object.keys(context.state);
        const vals = Object.values(context.state);
        const wrapper = new Function(...keys, 'global', 'self', 'event', `return (${expr})(event)`);
        return wrapper(...vals, context.global, context.self, context.event);
      } else {
        const func = new Function('state', 'global', 'self', 'event', `with(state) { return ${expr} }`);
        return func(context.state, context.global, context.self, context.event);
      }
    } catch (e) {
      console.error('[Lego] Eval error:', e, 'in:', expr);
      return undefined;
    }
  };

  const bind = (container, componentRoot) => {
    const state = componentRoot._studs;
    container.querySelectorAll('[\\@click], [l-model]').forEach(child => {
      const childData = getPrivateData(child);
      
      if (child.hasAttribute('@click') && !childData.clickBound) {
        childData.clickBound = true;
        child.addEventListener('click', (event) => {
          safeEval(child.getAttribute('@click'), { state, global: Lego.globals, self: child, event });
        });
      }

      if (child.hasAttribute('l-model') && !childData.modelBound) {
        childData.modelBound = true;
        const prop = child.getAttribute('l-model');
        const update = () => {
          const keys = prop.split('.');
          const last = keys.pop();
          const target = keys.reduce((o, k) => o[k], state);
          target[last] = child.type === 'checkbox' ? child.checked : child.value;
        };
        child.addEventListener('input', update);
        child.addEventListener('change', update);
      }
      
      if (child.hasAttribute('l-model')) {
        const val = resolve(child.getAttribute('l-model'), state);
        if (child.type === 'checkbox') child.checked = !!val;
        else child.value = val;
      }
    });
  };

  const scanForBindings = (container) => {
    const bindings = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node;
    while (node = walker.nextNode()) {
      if (node.nodeType === 1) {
        if (node.hasAttribute('l-if')) bindings.push({ type: 'l-if', node, expr: node.getAttribute('l-if') });
        if (node.hasAttribute('l-for')) {
          const match = node.getAttribute('l-for').match(/^\s*(\w+)\s+in\s+(.+)\s*$/);
          if (match) bindings.push({ type: 'l-for', node, itemName: match[1], listName: match[2].trim(), template: node.innerHTML });
        }
        if (node.hasAttribute('l-text')) bindings.push({ type: 'l-text', node, path: node.getAttribute('l-text') });
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
    const state = { ...Lego.globals, ...el._studs };

    data.bindings.forEach(b => {
      if (b.type === 'l-if') b.node.style.display = safeEval(b.expr, { state }) ? '' : 'none';
      if (b.type === 'l-text') b.node.textContent = resolve(b.path, state);
      if (b.type === 'text') b.node.textContent = b.template.replace(/{{(.*?)}}/g, (_, k) => {
        const key = k.trim();
        return key.includes('?') || key.includes(':') ? safeEval(key, { state }) : resolve(key, state);
      });
      if (b.type === 'attr') b.node.setAttribute(b.attrName, b.template.replace(/{{(.*?)}}/g, (_, k) => {
        const key = k.trim();
        return key.includes('?') || key.includes(':') ? safeEval(key, { state }) : resolve(key, state);
      }));
      if (b.type === 'l-for') {
        const list = resolve(b.listName, state) || [];
        const html = list.map((item) => b.template.replace(/{{(.*?)}}/g, (_, k) => {
          const key = k.trim();
          if (key === b.itemName) return item;
          if (key.startsWith(b.itemName + '.')) {
             return resolve(key.split('.').slice(1).join('.'), item);
          }
          // Handle ternary or complex expressions inside loops
          return safeEval(key, { state: { ...state, [b.itemName]: item } });
        })).join('');
        
        if (b.node.innerHTML !== html) {
          b.node.innerHTML = html;
          // Re-bind l-models inside the loop
          b.node.querySelectorAll('[l-model]').forEach(input => {
             const modelPath = input.getAttribute('l-model');
             if (modelPath.startsWith(b.itemName + '.')) {
                const subPath = modelPath.split('.').slice(1).join('.');
                const items = resolve(b.listName, state);
                const index = Array.from(b.node.children).indexOf(input.closest('li') || input.parentNode);
                const val = resolve(subPath, items[index]);
                if (input.type === 'checkbox') input.checked = !!val;
                else input.value = val;
                
                input.onchange = () => {
                   const newVal = input.type === 'checkbox' ? input.checked : input.value;
                   const target = resolve(subPath.split('.').slice(0, -1).join('.'), items[index]) || items[index];
                   target[subPath.split('.').pop()] = newVal;
                };
             }
          });
          bind(b.node, el);
        }
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