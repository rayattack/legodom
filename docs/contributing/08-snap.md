# Let there be, and it was!

If LegoDOM were a robot it would probably say - snap() is the most complex function I have because it acts as the "Middleman" between the static DOM, the reactive state, and the Shadow DOM. It is the "constructor" that the ~~stingy~~ browser never gave anyone - LegoDOM.


## Snap, snap, snap!

The `snap(el)` function is responsible for "upgrading" a standard HTML element. It is recursive, meaning if you snap a `<div>`, it will automatically look inside that `<div>` and snap every child as well.

```js
const snap = (el) => {
  if (!el || el.nodeType !== Node.ELEMENT_NODE) return;
  const data = getPrivateData(el);
  const name = el.tagName.toLowerCase();
  const templateNode = registry[name];

  if (templateNode && !data.snapped) {
    data.snapped = true;
    const tpl = templateNode.content.cloneNode(true);
    const shadow = el.attachShadow({ mode: 'open' });

    const splitStyles = (templateNode.getAttribute('b-styles') || "").split(/\s+/).filter(Boolean);
    if (splitStyles.length) {
       shadow.adoptedStyleSheets = splitStyles.flatMap(k => styleRegistry.get(k) || []);
    }

    // TIER 1: Logic from Lego.define (SFC)
    const scriptLogic = sfcLogic.get(name) || {};

    // TIER 2: Logic from the <template b-data="..."> attribute
    const templateLogic = parseJSObject(templateNode.getAttribute('b-data') || '{}');

    // TIER 3: Logic from the <my-comp b-data="..."> tag
    const instanceLogic = parseJSObject(el.getAttribute('b-data') || '{}');

    // Priority: Script < Template < Instance
    el._studs = reactive({
      ...scriptLogic,
      ...templateLogic,
      ...instanceLogic,
      // Inject Global Helpers
      get $route() { return Lego.globals.$route },
      get $go() { return Lego.globals.$go }
    }, el);

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
```

### 1. The Blueprint Lookup

When `snap(el)` runs, the first thing it does is determine if the element is a Lego component.

-   It converts the tag name to lowercase (e.g., `<MY-COMP>` becomes `my-comp`).
    
-   It checks the **`registry`** (which we filled in [Topic 2](./02-registry.md)) to see if a `<template>` exists for that name.
    
-   It uses `getPrivateData(el).snapped` to ensure it never "snaps" the same element twice, preventing infinite loops.
    

### 2. Attaching the Shadow DOM

If a template is found, Lego creates a **Shadow DOM** for the element:

JavaScript

```
const shadow = el.attachShadow({ mode: 'open' });

```

-   **Encapsulation**: By using `attachShadow`, the component’s internal styles and HTML are shielded from the rest of the page.
    
-   **Template Injection**: It clones the content of the template and appends it to this new Shadow Root.

#### What about `<slot>`?
Because we use native Shadow DOM, `<slot>` just works.
When `snap` attaches the shadow root, any children *already* inside the custom element (the "Light DOM") are automatically projected into the `<slot>` tags defined in your template.
We don't need to write any code for this—the browser does it for us.

    

### 3. CSS "self" Transformation

Lego includes a small but clever utility for styling:

JavaScript

```
style.textContent = style.textContent.replace(/\bself\b/g, ':host');

```

-   This allows you to write `self { color: red; }` in your template CSS.
    
-   During the snap process, Lego converts the word `self` to the official Web Component selector `:host`, which targets the component itself.
    

### 4. Data Merging & Reactivity

This is where the component's state is born. The library merges data from three different sources (we will dive deeper into this "Tier System" in Topic 9) and wraps the result in the **`reactive()`** proxy.

-   The resulting proxy is stored in `el._studs`. This is the "brain" of your component.
    

### 5. The First Render and Lifecycle

Once the data is ready and the Shadow DOM is attached:

1.  **`bind(shadow, el)`**: Connects event listeners (like `@click`) inside the Shadow DOM.
    
2.  **`render(el)`**: Performs the initial pass to fill in <code v-pre>{{ variables }}</code> and handle `b-show/b-for` logic.
    
3.  **`mounted()`**: If you defined a `mounted` function in your logic, Lego calls it now. This is your signal that the component is officially "alive" and visible on the page.

---------

**Crucial Logic Note:** At the very end of the function, `snap` calls itself on every child of the element: `[...el.children].forEach(snap)`. This ensures that if you have components nested inside components, they all "wake up" in a top-down order.
    

**Summary**: `snap()` takes a raw tag, gives it a Shadow DOM "soul," injects its HTML blueprint, sets up its reactive "brain" (`_studs`), and triggers its first breath (`mounted`).
