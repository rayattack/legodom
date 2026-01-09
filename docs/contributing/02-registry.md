# The Good Ole Registry (Lego Basket)

Let's not keep our toys everywhere, let's be good citizens and put them in a basket.

PSS!!! Come here lemme tell you a secret - are you a frontend developer? "The DOM is not your enemy"
we talk about Light DOM and Shadow DOM in a minute ;-).


## Topic 2: The Registry & Internal Storage

LegoDOM uses three specialized collections to store the "DNA" of your application. This separation allows the framework to distinguish between what a component **looks like** versus how it **behaves**.

```js
const registry = {};
const sfcLogic = new Map();
const sharedStates = new Map();
```

### 1. The HTML Blueprint Collection (`registry`)

`const registry = {}` is a plain object that stores references to `<template>` elements.

-   When the library initializes, it scans the DOM for any `<template b-id="my-component">` and saves it here.
    
-   The `b-id` becomes the key, and the DOM node itself is the value.
    
-   **Purpose:** This is the "Light DOM" source used to populate the "Shadow DOM" later during the "snapping" process.
    

### 2. The SFC Logic Collection (`sfcLogic`)

`const sfcLogic = new Map();` stores the JavaScript objects passed into `Lego.define()`.

-   While `registry` holds the HTML/CSS, `sfcLogic` holds the functions like `mounted()`, `updated()`, or custom methods.
    
-   **Why a Map?** Unlike a plain object, a `Map` is more performant for frequent lookups by string keys (tag names) - I think!!! or maybe I read wrong (call me out).
    

### 3. The Singleton States Collection (`sharedStates`)

`const sharedStates = new Map();` is one of the most powerful "hidden" features of LegoDOM.

-   Every time you define a component, Lego creates a **reactive version** of its logic and stores it here.
    
-   This allows other components to access a specific component's state globally via the `$registry('tag-name')` helper. **NOTE** the component's (template/blueprint) state, not the instance state.
    
-   **Example:** If you have 3 `user-profile` components, any other component on the page can peek at their (shared) state data by asking the `sharedStates` map.


#### Dissecting Registration

The `registry` doesn't just wait for you to type; it's fed by three distinct streams across 2 paradigms.

**Paradigm 1: Explicitly**

```js
const sfcLogic = new Map(); // Specifically for SFC script logic
// ...
define: (tagName, templateHTML, logic = {}) => {
  const t = document.createElement('template');
  // ... stores template in registry
  sfcLogic.set(tagName, logic); // Stores the JS part separately
}
```

**Paradigm 2: Implicitly**

```js
// vite-plugin.js
async buildStart() {
  const root = config?.root || process.cwd();
  legoFiles = await fg(include, { cwd: searchPath, absolute: true }); // Scans for .lego files
}
// ...
async load(id) {
  if (id.endsWith('.lego')) {
    const defineCall = generateDefineCall(parsed); // Converts .lego file to Lego.define()
    return `import { Lego } from 'lego-dom/main.js';\n${defineCall}`;
  }
}

```

**The Three Ways to Register:**
1.  **The HTML Manual Method:** You put `<template b-id="my-comp">` directly in your `*.html` files. During `Lego.init()`, the library scrapes these and populates the registry. This is great for "no-build" prototypes.
    
2.  **The `Lego.define()` JS Method:** You call `Lego.define('my-comp', '<h1>Hi</h1>', { ... logic })` in a standard JavaScript file.
    
3.  **The SFC Automatic Method (The "Vite Way"):** * The **Vite Plugin** (as seen in `vite-plugin.js`) acts as a build-time robot.
    
    -   It uses `fast-glob` (`fg`) to scan your entire `src/components` directory for any file ending in `.lego`.
        
    -   It parses the `<template>` and `<script>` inside that `.lego` file.
        
    -   It **injects** a `Lego.define()` call into your JavaScript bundle automatically.
        
    -   **Result:** You just create a file named `UserCard.lego`, and suddenly `<user-card>` is a valid HTML tag in your app.
        
**Key Insight:** Notice in `main.js` how `define` uses `sfcLogic.set(tagName, logic)`. This is where the plugin "parks" your component's JavaScript code so that when the component "snaps" (Topic 23), it can find its specific logic.