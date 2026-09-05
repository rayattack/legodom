# The Registry & Internal Storage

Let's organize our building blocks efficiently. Everything lives in `src/core/registry.js` now.

> PSS!!! Come here lemme tell you a secret - are you a frontend developer? "The DOM is not your enemy" we talk about Light DOM and Shadow DOM in a minute ;-).

## The Registry in the Modular World

LegoDOM uses specialized collections to store the "DNA" of your application. This separation allows the framework to distinguish between what a block **looks like** versus how it **behaves**.

Located in `src/core/registry.js`:

```js
// Block templates (HTML blueprints)
export const registry = {};

// Block logic (functions, data)
export const legoFileLogic = new Map();

// Singleton states (shared across instances)
export const sharedStates = new Map();

// Per-element private metadata
export const privateData = new WeakMap();

// List rendering pools (for b-for)
export const forPools = new Map();

// Item identity tracking (for keyed lists)
export const itemIdMap = new WeakMap();

// Active block tracking
export const activeBlocks = new Set();

// Private data accessor
export const getPrivateData = (el) => {
  if (!privateData.has(el)) {
    privateData.set(el, {
      snapped: false,
      bindings: null,
      rendering: false,
      anchor: null,
      bound: false
    });
  }
  return privateData.get(el);
};
```

### 1. The HTML Blueprint Collection (`registry`)

`const registry = {}` is a plain object that stores references to `<template>` elements.

-   When LegoDOM initializes, it scans the DOM for any `<template b-id="my-block">` and saves it here.
    
-   The `b-id` becomes the key, and the DOM node itself is the value.
    
-   **Purpose:** This is the "Light DOM" source used to populate the "Shadow DOM" later during the "snapping" process (see `src/core/lifecycle.js`).
    

### 2. The Lego File Logic Collection (`legoFileLogic`)

`const legoFileLogic = new Map();` stores the JavaScript objects passed into `Lego.block()`.

-   While `registry` holds the HTML/CSS, `legoFileLogic` holds the functions like `mounted()`, `unmounted()`, or custom methods.
    
-   **Why a Map?** Unlike a plain object, a `Map` is more performant for frequent lookups by string keys (tag names).
    

### 3. The Singleton States Collection (`sharedStates`)

`const sharedStates = new Map();` is one of the most powerful "hidden" features of LegoDOM.

-   Every time you define a block, Lego creates a **reactive version** of its logic and stores it here.
    
-   This allows other blocks to access a specific block's state globally via introspection. **NOTE** the block's (template/blueprint) state, not the instance state.
    
-   **Example:** If you have 3 `user-profile` blocks, the shared state contains the default/template-level data.
    

## Dissecting Registration

The `registry` is populated through three distinct paradigms:

**Paradigm 1: Explicitly via JavaScript**

In `src/index.js`, the `Lego.block()` method:

```js
block: (tagName, templateHTML, logic = {}, styles = "", cascade = "", error = "") => {
  const t = document.createElement('template');
  t.setAttribute('b-id', tagName);
  t.setAttribute('b-stylesheets', styles);
  if (cascade) t.setAttribute('b-cascade', cascade);
  if (error) t.setAttribute('b-error', error);
  t.innerHTML = templateHTML;
  registry[tagName] = t;
  legoFileLogic.set(tagName, logic);
  
  // Create reactive singleton
  const sharedState = {};
  mergeDescriptors(logic, sharedState);
  sharedStates.set(tagName.toLowerCase(), reactive(sharedState, document.body));
  
  // Upgrade existing elements
  document.querySelectorAll(tagName).forEach(snap);
}
```

**Paradigm 2: Implicitly via Vite Plugin**

The `vite-plugin.js` (in project root) scans for `.lego` files at build time:

```js
// vite-plugin.js
async buildStart() {
  const searchPath = getSearchPath();
  legoFiles = await fg(include, { cwd: searchPath, absolute: true });
}

async load(id) {
  if (id.endsWith('.lego')) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = parseLego(content, filename);
    const blockCall = generateBlockCall(parsed);
    
    return `import { Lego } from '${importPath}';
const $db = Lego.db;

${blockCall}

export default '${parsed.blockName}';`;
  }
}
```

The plugin uses `src/utils/parser-utils.js` to parse the `.lego` file and generates a call to `Lego.block()`.

**Paradigm 3: Runtime Block Definition**

In `src/core/parser.js`, the `defineLegoFile()` function enables runtime compilation:

```js
export const defineLegoFile = (Lego, content, filename = 'block.lego') => {
  const parsed = parseLego(content, filename);
  const { blockName, template, script, style, stylesAttr, cascadeAttr, errorAttr } = parsed;
  
  // Extract and evaluate logic
  let logicObj = {};
  if (script) {
    const trimmed = script.trim();
    const match = trimmed.match(/export\s+default\s+({[\s\S]*})/);
    const code = match ? match[1] : trimmed;
    logicObj = new Function('Lego', '$db', `return ${code}`)(Lego, Lego.globals.$db);
  }
  
  // Register template
  registry[blockName] = document.createElement('template');
  registry[blockName].innerHTML = style ? `<style>${style}</style>${template}` : template;
  
  // Register logic
  legoFileLogic.set(blockName, logicObj);
  
  // Upgrade existing elements
  document.querySelectorAll(blockName).forEach(el => !getPrivateData(el).snapped && snap(el));
};
```

This enables the **Server Loader** feature: fetch a `.lego` file from the server and compile it in the browser using `new Function()`.

## The Three Ways to Register

1.  **The HTML Manual Method:** Put `<template b-id="my-comp">` directly in your `*.html` files. During `Lego.init()`, LegoDOM scrapes these and populates the registry.
    
2.  **The `Lego.block()` JS Method:** Call `Lego.block('my-comp', '<h1>Hi</h1>', { ... logic })` in a standard JavaScript file.
    
3.  **The Lego File Automatic Method (The "Vite Way"):** The **Vite Plugin** scans for `.lego` files, parses them using `src/utils/parser-utils.js`, and injects `Lego.block()` calls automatically.
    

## Block Naming Conventions

When you define a block via a file (e.g. `.lego`), LegoDOM automatically derives the tag name using `deriveBlockName()` from `src/utils/helpers.js`:

```js
export const deriveBlockName = (filename) => {
  const basename = filename.split('/').pop().replace(/\.lego$/, '');
  // Convert snake_case and PascalCase to kebab-case
  const name = basename
    .replace(/_/g, '-')
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();
  
  if (!name.includes('-')) {
    throw new Error(`Block names must contain a hyphen (e.g. user-card.lego or UserCard.lego).`);
  }
  return name;
};
```

**Automatic Conversion**:
-   `UserProfile.lego` → `<user-profile>`
-   `navBar.lego` → `<nav-bar>`
-   `data_table.lego` → `<data-table>`

**The Hyphen Rule**: A custom element **MUST** contain a hyphen.
-   `Button.lego` → Error
-   `Adidas.lego` → Error

> [!TIP]
> **Single Word Block? Namespace It!** 
> Custom Element specs require a hyphen to distinguish from native tags. **LegoDOM will throw an error** if you try to define a single-word block.
> Simply add your app or product prefix:
> -   `fb-button.lego` → `<fb-button>`
> -   `shop-card.lego` → `<shop-card>`
