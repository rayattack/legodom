# Paint Me HTML

In Topic 11, we mapped out where the dynamic "holes" in your HTML are. Now, we look at the engine that actually fills them with data. The `render()` function is the most frequently called piece of code in LegoDOM, it is the bridge between JavaScript state and the pixels on the screen.


## Rendering `render()` Engine

The `render(el)` function doesn't refresh the whole component. Instead, it iterates through the "Instruction Objects" (bindings) created during the scanning phase and updates only what is necessary.

```js
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
      if (b.type === 'b-show') b.node.style.display = safeEval(b.expr, { state, self: b.node }) ? '' : 'none';
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
  } finally {
    data.rendering = false;
  }
};
```

### 1. The Guard Rails

Before doing any work, `render` checks two things:

-   **The State**: It ensures `el._studs` exists.
    
-   **The Recursion Lock**: It sets `data.rendering = true` at the start and `false` at the end. This prevents a "Render Loop" where an update triggers a render, which accidentally triggers another update.
    

### 2. Surgical Execution

The function loops through `data.bindings` and performs specific actions based on the `type`:

-   **`b-show`**: It evaluates the expression. If false, it sets `display: none`. This is a "CSS-based" conditional; the element stays in the DOM but becomes invisible. **Might change to `remove()` in the future**
    
-   **`b-text`**: It uses the `resolve()` helper to find the value in your state and sets the `textContent`.
    
-   **`text` (Mustaches)**: It takes the original template (e.g., `Count: {{count}}`), replaces the mustache with the actual value, and updates the text node.
    
-   **`attr`**: It updates attributes like `src`, `href`, or `class`. It even has a special check: if the attribute is `class`, it also updates `node.className` to ensure the browser applies the styles correctly.
    

### 3. The `safeEval` Bridge

You’ll notice that for things like `b-show` or <code v-pre>{{mustaches}}</code>, the library calls `safeEval(expr, { state, self: b.node })`.

-   This allows your HTML to handle more than just simple variables.
    
-   You can write logic directly in your template, like <code v-pre>{{ count > 10 ? 'Big' : 'Small' }}</code>.
    
-   `render` passes the current state as the "context," so those expressions know exactly what `count` refers to.
    

### 4. Directives vs. Mustache Priority

`render` processes directives (like `b-show` and `b-text`) and mustaches in the same loop. However, because it works with direct DOM references saved in the `bindings` array, it never has to "re-parse" the HTML string. It simply touches the specific property (like `.value` or `.textContent`) of the existing DOM node.

----------

**Summary**: `render()` is a "Loop of Truth." It walks through the map created by the scanner, evaluates the current state of your data, and applies those values to the specific DOM nodes that need them.
