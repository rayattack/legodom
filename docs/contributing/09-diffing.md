# He said, She said, They Said, Who Said?

This topic is about the "Power Struggle" inside the code. When a component is born, it needs to know what its data is. The library looks at three different places to find that data, and it has a strict hierarchy of who wins in a conflict.


## Diffing, Merging, and Priorities (The Tier System)

Inside the `snap(el)` function, you will see a variable called `logic`. This isn't just a simple object; it is the result of a three-way merge. The code uses the spread operator `{ ... }` to layer these "Tiers."

### The Three Tiers of Authority

1.  **Tier 1: The Global Definition (Lowest Priority)**
    
    ```js
    const baseLogic = sfcLogic.get(name) || {};
    
    ```
    
    This is the JavaScript object you provided when you called `Lego.define()`. It contains your default values and methods. It’s the "fallback" data. SFCs and .lego files fall under this tier.
    
2.  **Tier 2: The Template Attributes (Middle Priority)**

    
    ```js
    const templateLogic = parseJSObject(t.getAttribute('b-data')) || {};
    
    ```
    
    Lego looks at the `<template>` tag itself in your HTML. If you added a `b-data` attribute there, it overrides the global definition. This is useful for creating "variants" of a component template without writing new JavaScript.
    
3.  **Tier 3: The Instance Attributes (Highest Priority)**
    
    ```js
    const instanceLogic = parseJSObject(el.getAttribute('b-data')) || {};
    
    ```
    
    This is the data attached to the specific tag on your page (e.g., `<user-profile b-data="{id: 42}">`). This is the "Final Word." If the instance says the ID is 42, it doesn't matter what the template or the global definition said.
    

### The Merge Order

The code combines them like this:

JavaScript

```
const mergedLogic = { ...baseLogic, ...templateLogic, ...instanceLogic };

```

In JavaScript, when you spread objects, the properties on the right overwrite properties on the left. So, Instance > Template > Definition.

### The `parseJSObject` Utility

To make this work, the library includes a helper called `parseJSObject`.

-   **Why not `JSON.parse`?** JSON is strict (requires double quotes, no functions).
    
-   **The Library's Way**: It uses `new Function('return ' + str)()`. This is a powerful (and dangerous) trick that allows you to write actual JavaScript inside your HTML attributes, including functions or arrays, which Lego then evaluates into a real object.
    

### The Edge Case: `b-data` as a "Ref"

If the `b-data` attribute starts with a `$`, like `b-data="$someGlobal"`, the library treats it as a pointer to a global variable instead of a raw object string. This allows for deep data sharing between the component and the outside world.

----------

**Summary**: A component's data is a "Cake" with three layers. The Global Logic is the bottom, the Template Logic is the middle, and the Instance Logic is the frosting. The "Frosting" (Instance) is what the user ultimately sees.
