# State Management

Let's see how the "Cake" of data we merged in Topic 9 is actually brought to life. This is the moment a static object becomes a **Reactive State**, which LegoDOM stores in a property called `_studs`.


## The `reactive` State (`_studs`)

Once `snap()` has merged the data from the SFC (Tier 1), the Template (Tier 2), and the Instance (Tier 3), it doesn't just save that object to the element. It transforms it.

```js
//...rest of code
  const tpl = templateNode.content.cloneNode(true);
  const shadow = el.attachShadow({ mode: 'open' });

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
    get $route() { return Lego.globals.$route },
    get $go() { return Lego.globals.$go }
  }, el);
  //... rest of code
```

### 1. Why the name `_studs`?

In the physical world, "studs" are the bumps on top of a Lego brick that allow it to connect to others. In this library:

-   **`el._studs`** represents the connection point between your JavaScript logic and the DOM.
    
-   It is the "source of truth" for the component. Every `{{variable}}` you write in your HTML is looking for a matching key inside `_studs`.
    

### 2. The Transformation

LegoDOM executes this line during the snap process:

```js
el._studs = reactive({ ...mergedLogic }, el);

```

-   **The `reactive` call**: This wraps the merged object in the **Proxy** we discussed in Topic 4.
    
-   **The `el` argument**: Crucially, the proxy is given a reference to the DOM element (`el`). This allows the Proxy's `set` trap to know exactly which component needs to be added to the `globalBatcher` when a property changes.
    

### 3. Contextual Binding (The `this` Keyword)

After the `_studs` proxy is created, LegoDOM ensures that your methods work correctly. When you define a method in your SFC, you expect `this` to point to your data.

-   Inside `snap()`, lifecycle hooks are called like this: `el._studs.mounted.call(el._studs)`.
    
-   By using `.call(el._studs)`, LegoDOM forces the execution context of your functions to be the reactive proxy.
    
-   **Result**: When you write `this.count++` in your code, you are actually interacting with the **Proxy**, which triggers the `set` trap, which notifies the **Batcher**, which triggers the **Render**.
    

### 4. Visibility vs. Privacy

-   **`_studs`**: This is attached directly to the DOM element. You can actually type `document.querySelector('my-component')._studs` in your browser console to see and even modify the live state of any component.
    
-   **`privateData`**: Unlike `_studs`, the internal "housekeeping" (like whether the component has already snapped) is kept in a `WeakMap` called `privateData`, making it inaccessible to the outside world.
    

----------

**Summary**: `_studs` is the reactive engine of your component. It is created by merging all data tiers into a Proxy that is uniquely linked to that specific DOM element.
