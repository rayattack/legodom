# Scanner

Now let's get into the "eyes" of the rendering engine. For LegoDOM to be able to update the DOM efficiently, it needs to know which specific parts of your HTML are static (never change) and which parts are dynamic (contain {{mustaches}} or b- directives).


## Scanning for Bindings (The `TreeWalker`)

In `main.js`, the `scanForBindings` function is called the very first time a component renders. Instead of re-scanning the DOM every time a variable changes, Lego scans **once**, creates a "map" of all the dynamic spots, and saves that map in the element's `privateData`.

```js
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

    if (node.nodeType === Node.ELEMENT_NODE) {
      if (node.hasAttribute('b-show')) bindings.push({ type: 'b-show', node, expr: node.getAttribute('b-show') });
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
    } else if (node.nodeType === Node.TEXT_NODE && node.textContent.includes('{{')) {
      bindings.push({ type: 'text', node, template: node.textContent });
    }
  }
  return bindings;
};
```

## Why Regex? (The "Forbidden" Choice)

You will notice we use Regular Expressions to find bindings.

**"Regex is bad for HTML!"** they say.
Usually, yes. But we are not parsing *arbitrary* HTML to build a DOM. We are scanning *specific known tokens* inside trusted templates.

**The Trade-off:**
- **AST Parser**: Reliable, but heavy (10kb+).
- **Regex Scanner**: Good enough for 99% of bindings, extremely light (<1kb).

Since LegoDOM targets **speed** and **size** (<4kb), Regex is the correct architectural choice. We mitigate edge cases by ignoring bindings inside `<script>` and `<style>` blocks.

### 1. The `TreeWalker` Efficiency

LegoDOM uses a native browser tool called a `TreeWalker`.

```js
const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);

```

-   **Why not `querySelectorAll('*')`?** A `TreeWalker` is much faster and more memory-efficient. It allows LegoDOM to step through every single node (including text nodes) one by one.
    

### 2. The "Nested Component" Shield

One of the smartest parts of this function is the `isInsideBFor` check.

-   If the scanner finds an element that is inside a `b-for` loop or belongs to a **different** custom component (i.e. user-profile, product-card etc.), it stops.
    
-   **Reasoning**: You don't want the parent component to try and manage the internal text of a child component. This maintains **Encapsulation**.
    

### 3. What it looks for

As it walks the tree, it populates a `bindings` array with "Instruction Objects":

-   **Directives**: It looks for `b-show`, `b-text`, `b-sync`, and `b-for` attributes.
    
-   **Mustaches in Text**: It looks for text nodes containing <code v-pre>{{ }}</code>. It saves the original template (e.g., `"Hello {{name}}"`) so it can swap the name later without losing the "Hello".
    
-   **Mustaches in Attributes**: It scans every attribute (like <code v-pre>class="btn {{color}}"</code>) to see if it needs to be dynamic.
    

### 4. The "Instruction Object" Structure

When it finds something, it pushes an object like this into the list:

```js
{ 
  type: 'text', 
  node: [The actual TextNode], 
  template: 'Hello {{user.name}}' 
}

```

By storing the **actual Node reference**, LegoDOM can update the screen later with surgical precision. It doesn't have to search the DOM again; it just goes straight to that specific memory address and updates the value.

----------

**Summary**: `scanForBindings` is a one-time "reconnaissance mission." it maps out every dynamic part of your component so that future updates are lightning-fast.
