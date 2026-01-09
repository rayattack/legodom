# You know C++, I know Web Components++

Let's break down the two simplest yet most vital directives in the library: b-if and b-text. These are the "workhorses" that handle visibility and data display without you having to write manual DOM manipulation code.

## Conditional Directives `b-if` & `b-show`

Directives like `b-if`, `b-text`, and `b-for` are the "Instructions" that bridge the gap between your JavaScript state and the DOM. Without them, your state would just be numbers and strings sitting in memory with no way to manifest on the screen.

### 1. Conditional Visibility (`b-show`)

The `b-show` directive is used to show or hide elements based on a truthy or falsy value in your state.

-   **How it works**: During the `render()` cycle, the library executes `safeEval(b.expr, { state, self: b.node })`.
    
-   **The Implementation**:

    
    ```js
    if (b.type === 'b-show') b.node.style.display = safeEval(b.expr, { state, self: b.node }) ? '' : 'none';
    ```
    
    -   LegoDOM does not physically remove the element from the DOM (which is expensive), this library uses `display: none`.
    
    -   This means **b-show** is incredibly fast because the browser doesn't have to recalculate the entire DOM tree.
        
    -  It however also means the element still exists in memory and its `mounted` hook remains active even when hidden.


### 2. Alternating Visibility (`b-if`)

#### 1. The "Place in Line" Problem

When an element has `b-if="false"`, we want it to disappear. If we simply remove it (`node.remove()`), the browser "forgets" where that element was supposed to live.

-   **The Risk:** If that element was originally between a `<h1>` and a `<footer>`, and the condition turns `true` later, how does the library know exactly where to put it back?
    
-   **The Solution:** We leave a "bookmark" or an **Anchor** (a tiny, invisible `Comment` node) exactly where the element used to be.

```js
if (node.hasAttribute('b-if')) {
    const expr = node.getAttribute('b-if');
    // Create an anchor point to keep track of where the element belongs in the DOM
    const anchor = document.createComment(`b-if: ${expr}`);
    const data = getPrivateData(node);
    data.anchor = anchor;
    bindings.push({ type: 'b-if', node, anchor, expr });
}
```
    

### 2. Why use a Comment Node?

We use `document.createComment()` because:

-   It is a valid DOM node that occupies a specific position in the `childNodes` list.
    
-   It is completely invisible to the user and doesn't affect CSS layouts or accessibility.
    
-   It acts as a permanent reference point for the `replaceChild` operation.
    

### 3. Why store it in `getPrivateData`?

LegoDOM was designed in a way that the `render()` function runs every time state changes.

-   **Consistency:** By storing the anchor in the element's `privateData` (via `WeakMap`), we ensure that the same specific element is always paired with the same specific anchor.
    
-   **The Swap Logic:**
    
    -   **Condition becomes `false`:** We find the element in the DOM and replace it with its stored anchor: `parent.replaceChild(anchor, node)`.
        
    -   **Condition becomes `true`:** We find the anchor in the DOM and replace it with the element: `parent.replaceChild(node, anchor)`.
        

### 4. Memory Safety

By using `getPrivateData` (which is a `WeakMap`), we ensure that if the component is destroyed, the reference to the `anchor` is garbage collected. If we didn't store it here, we would have to scan the entire DOM or maintain complex external maps to find where to re-insert hidden elements, which would be a massive performance hit.

**In short:** The anchor is the "Reserved Seat" sign at a theater. `getPrivateData` is the list that remembers which seat belongs to which person while they are out in the lobby.


## Simple Text Interpolation (`b-text`)

While you can use <code v-pre>{{mustaches}}</code>, `b-text` is the "cleaner" way to bind the entire content of an element to a single variable.

-   **The Logic**: It uses the `resolve()` helper to walk through your state object based on a string path.
    
    -   Example: `<span b-text="user.profile.name"></span>`.
        
-   **The Implementation**:
    
    ```js
    if (b.type === 'b-text') b.node.textContent = escapeHTML(resolve(b.path, state));
    ```

-   **Security**: Note the use of `escapeHTML()`. This is a critical security feature that prevents **XSS (Cross-Site Scripting) attacks** by turning characters like `<` into `&lt;`, ensuring that user-provided data cannot execute malicious scripts in your app.


### 3. Efficiency in the Render Loop

Because both of these were "mapped" during the `scanForBindings` phase (Topic 11), the `render` engine holds a direct reference to the DOM `node`.

-   It doesn't have to look for the element by ID or class.
    
-   It just goes: "Variable X changed -> Go to memory address for Node Y -> Update `.style.display` or `.textContent`".


## Iterative Directive: `b-for` & The Pool

The library looks for the pattern `item in list` (e.g., `user in users`).

-   **Capture**: During the scanning phase, it saves the inner HTML of the element as a "template string" and then empties the element so it can be filled dynamically.
    

### The Concept of "The Pool" (`forPools`)

To prevent "DOM Thrashing" (constantly creating and deleting elements), the library uses a `WeakMap` called `forPools`.

-   **The Cache**: Each `b-for` node has its own `Map` inside the pool.
    
-   **The Key**: It identifies each item in your array. If the item is an object, it assigns a hidden `__id`. If it's a primitive (like a string), it combines the index and the value.
    
-   **Why?**: If you re-order a list of 100 items, the library doesn't create 100 new elements. it finds the existing elements in the "pool" by their key and simply moves them to the new position.
    

### 3. The Local Scope Injection

This is a brilliant piece of JavaScript engineering. When rendering a list item, the library needs the item (e.g., `user`) to be available, but it also needs the parent component's data to be available.


```js
const localScope = Object.assign(Object.create(state), { [b.itemName]: item });

```

-   **Prototype Inheritance**: It creates a new object where the **prototype** is the component's state (`_studs`).
    
- **The Result**: Inside the loop, if you reference <code v-pre>{{user.name}}</code>, it finds it on the `localScope`. If you reference <code v-pre>{{globalTitle}}</code> (defined in the parent), it doesn't find it on `localScope`, so it automatically looks up the prototype chain to find it in the parent `state`.
    

### 4. Updating and Pruning

-   **Update**: For every item in the current array, it calls `updateNodeBindings(child, localScope)` to fill in the mustaches for that specific row.
    
-   **Surgical Sync**: It specifically looks for `b-sync` inputs inside the loop to ensure two-way binding works correctly for individual list items.
    
-   **Prune**: After the loop finishes, any element left in the "pool" that wasn't used in the current render (meaning it was deleted from your data array) is physically removed from the DOM.

## Directive: `b-sync` (Two-Way Binding)

The `b-sync` directive is designed to keep an `<input>`, `<textarea>`, or `<select>` element in perfect synchronization with a specific variable in your state.

```js
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
```

### 1. The Setup: Listening for Changes

When the `scanForBindings` function encounters a `b-sync="somePath"` attribute, it doesn't just record it for rendering; it attaches an **event listener** to the element.

-   **The Event**: It listens for the `input` event (which fires every time a character is typed).
    
-   **The Logic**: When the event fires, the library captures the `event.target.value`.
    
-   **The Update**: It uses the internal `set()` helper to reach into your component's `_studs` and update the value at the path you specified (e.g., `user.name`).
    

### 2. The Implementation: Multi-Type Support

The library is smart enough to handle different types of inputs automatically:

-   **Checkboxes**: It looks at `.checked` instead of `.value`.
    
-   **Numbers**: If the input `type` is "number" or "range", it automatically converts the string from the DOM into a real JavaScript `Number` before saving it to your state.
    

### 3. Preventing the "Echo" Effect

A common problem in two-way binding is the "Infinite Update Loop":

1.  You type "A".
    
2.  `b-sync` updates the state to "A".
    
3.  The state change triggers a `render()`.
    
4.  `render()` updates the input value to "A".
    
5.  The cursor jumps to the end of the input or triggers another event.
    

**How Lego solves it**: During the `render()` phase for a `b-sync` binding, the library checks if the element is currently the `document.activeElement` (the thing you are typing in). If it is, and the value hasn't changed from what's already there, it skips the update to avoid disturbing your typing flow.

### 4. The `b-sync` inside `b-for` loops

As mentioned in Topic 14, `b-sync` works inside loops. If you have a list of inputs generated by a `b-for`, each input is synced to its specific item in the array. The library uses the `localScope` (with its prototype chain) to ensure that typing in the 3rd input only updates the 3rd item in your data list.

----------

**Summary**: `b-if` manages visibility via CSS, and `b-text` manages safe text updates via property resolution.

`b-for` is a "Reconciliation Engine". It uses a memory pool to recycle DOM nodes and clever prototype inheritance to give each row access to both its own data and the parent's data.

`b-sync` automates the "Boilerplate" of web development. You no longer have to write `onchange` handlers for every input; you just name the variable, and the library handles the rest.
