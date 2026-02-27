# Directives

Directives are special attributes that add reactive behavior to elements.

## b-if

Conditional rendering (adds/removes from DOM).

### Basic Usage

```html
<p b-if="isLoggedIn">Welcome back!</p>
<p b-if="!isLoggedIn">Please log in</p>
```

### With Expressions

```html
<div b-if="count > 0">Count is [[ count ]]</div>
<div b-if="items.length === 0">No items</div>
```

::: tip b-if vs b-show
`b-if` adds or removes the element from the DOM.
`b-show` toggles `display: none`.

Use `b-if` if the condition rarely changes.
Use `b-show` if you toggle often.
:::

## b-show

Conditional rendering using `display: none`.

### Basic Usage

```html
<p b-show="isLoggedIn">Welcome back!</p>
<p b-show="!isLoggedIn">Please log in</p>
```

### With Expressions

```html
<div b-show="count > 0">Count is [[ count ]]</div>
<div b-show="items.length === 0">No items</div>
<div b-show="user && user.role === 'admin'">Admin panel</div>
```

### Multiple Conditions

```html
<p b-show="isLoggedIn && isPremium">Premium content</p>
<p b-show="age >= 18 || hasParentConsent">Access granted</p>
```

::: tip How it Works
`b-show` sets `display: none` when the condition is false. The element stays in the DOM but is hidden.
:::

## b-html

Renders raw HTML content.

> [!WARNING]
> Only use on trusted content. This exposes you to XSS vulnerabilities if used with user input.

```html
<div b-html="rawContent"></div>
```

```js
{
  rawContent: '<b>Bold</b> and <i>Italic</i>'
}
```

## b-text

Sets the text content of an element.

> [!WARNING] Limitation
> **`b-text` is extremely weak.** Unlike `[[ ]]`, it **does not** support JavaScript expressions (math, logic, functions). It ONLY supports simple property paths.

### Functionality

| Syntax | Supported? | Example |
| :--- | :--- | :--- |
| **Property Path** | Yes | `b-text="user.name"` |
| **Math** | No | `b-text="count + 1"` |
| **Logic** | No | `b-text="isActive ? 'Yes' : 'No'"` |
| **Methods** | No | `b-text="formatDate(date)"` |

Use `[[ ]]` for anything complex. `b-text` is strictly for direct property binding.

```html
<!-- Works -->
<span b-text="user.name"></span>

<!-- Does NOT Work (Use [[ ]] instead) -->
<span b-text="user.firstName + ' ' + user.lastName"></span>
<span b-text="count + 1"></span>
```

## b-var

Creates a reference to a DOM element accessible via `this.$vars`.

Use `b-var` when you need direct DOM access (e.g., `.focus()`, `.click()`, `.play()`).

### Usage

```html
<input type="file" b-var="fileInput" style="display:none">
<button @click="$vars.fileInput.click()">Upload</button>
```

Or in script:

```javascript
export default {
  openPicker() {
    this.$vars.fileInput.click();
  }
}
```

## b-init

Runs an expression **exactly once** when the element is first rendered. Subsequent re-renders will not re-execute the expression.

### Usage

```html
<div b-init="console.log('Component initialized')">
  Content here
</div>
```

### Common Use Cases

**Analytics tracking:**
```html
<section b-init="trackPageView('pricing')">
  <h1>Pricing</h1>
</section>
```

**One-time setup:**
```html
<canvas b-init="initChart()"></canvas>
```

**Lazy image loading:**
```html
<img b-init="loadImage()" data-src="/photos/hero.jpg">
```

::: tip When to use b-init vs mounted()
Use `b-init` for **element-level** one-time setup (e.g., a specific element inside a template). Use `mounted()` for **block-level** initialization (e.g., fetching data, starting timers).
:::

## b-for

List rendering.

### How It Works

The element with `b-for` becomes the **template**. It is **replaced** by its cloned siblings:

```html
<!-- Template -->
<ul>
  <li b-for="item in items">[[ item ]]</li>
</ul>

<!-- Renders as: -->
<ul>
  <!--b-for: item in items-->
  <li>Apple</li>
  <li>Banana</li>
  <li>Cherry</li>
</ul>
```

The original `<li b-for>` is removed and replaced with a comment anchor. Each clone is inserted as a sibling.

### Basic Syntax

```html
<ul>
  <li b-for="item in items">[[ item ]]</li>
</ul>
```

### With Objects

```html
<ul>
  <li b-for="todo in todos">
    [[ todo.text ]] - [[ todo.done ? 'Done' : 'Pending' ]]
  </li>
</ul>
```

### Accessing Index

Use `$index` to get the current item's position (0-based):

```html
<ul>
  <li b-for="item in items">
    #[[ $index + 1 ]]: [[ item.name ]]
  </li>
</ul>
```

### Nested Loops

```html
<div b-for="category in categories">
  <h3>[[ category.name ]]</h3>
  <ul>
    <li b-for="product in category.products">
      [[ product.name ]]
    </li>
  </ul>
</div>
```

### With Conditionals

```html
<li b-for="user in users">
  <span b-show="user.active">✅ [[ user.name ]]</span>
  <span b-show="!user.active">❌ [[ user.name ]]</span>
</li>
```

### Stable Rendering with b-key

By default, `b-for` tracks objects by auto-detecting common ID fields (`id`, `_id`, `uuid`, `key`). For inline arrays or objects without these fields, use `b-key` to specify a unique identifier:

```html
<div b-for="menu in menus" b-key="name">
  <span>[[ menu.icon ]]</span>
  <span>[[ menu.name ]]</span>
</div>
```

```js
{
  menus: [
    { icon: 'home', name: 'Home' },
    { icon: 'settings', name: 'Settings' }
  ]
}
```

**Why `b-key` matters:**
- Prevents DOM thrashing when lists update
- Maintains text selection and focus state
- Improves performance by reusing existing DOM nodes

#### Auto-Detection

If you don't specify `b-key`, LegoDOM automatically looks for these fields (in order):
1. `item.id`
2. `item._id`
3. `item.uuid`
4. `item.key`

```html
<!-- No b-key needed if items have 'id' -->
<div b-for="user in users">
  [[ user.name ]]
</div>
```

```js
{
  users: [
    { id: 1, name: 'Alice' },  // ✅ 'id' is auto-detected
    { id: 2, name: 'Bob' }
  ]
}
```

#### Nested Property Paths

You can use dot notation for nested keys:

```html
<div b-for="item in items" b-key="user.id">
  [[ item.user.name ]]
</div>
```

```js
{
  items: [
    { user: { id: 'u1', name: 'Alice' } },
    { user: { id: 'u2', name: 'Bob' } }
  ]
}
```

#### When to Use b-key

✅ **Use `b-key` when:**
- Iterating over inline arrays: `b-for="item in [{ name: 'A' }, { name: 'B' }]"`
- Objects lack `id`, `_id`, `uuid`, or `key` fields
- You need a specific property as the unique identifier

❌ **Don't use `b-key` when:**
- Your objects already have an `id` field (it's auto-detected)
- Iterating over primitives (strings, numbers) — index-based keys work fine


## b-sync

Two-way data binding for form inputs.

### Text Input

```html
<input b-sync="username" placeholder="Enter username">
<p>Hello, [[ username ]]!</p>
```

### Checkbox

```html
<input type="checkbox" b-sync="agreed">
<p b-show="agreed">You agreed to the terms</p>
```

### Radio Buttons

```html
<input type="radio" name="size" value="small" b-sync="selectedSize">
<input type="radio" name="size" value="medium" b-sync="selectedSize">
<input type="radio" name="size" value="large" b-sync="selectedSize">
<p>Selected: [[ selectedSize ]]</p>
```

### Select Dropdown

```html
<select b-sync="country">
  <option value="us">United States</option>
  <option value="uk">United Kingdom</option>
  <option value="ca">Canada</option>
</select>
<p>Country: [[ country ]]</p>
```

### Textarea

```html
<textarea b-sync="message" rows="4"></textarea>
<p>[[ message.length ]] characters</p>
```

### In b-for Loops

```html
<li b-for="todo in todos">
  <input type="checkbox" b-sync="todo.done">
  <span class="[[ todo.done ? 'done' : '' ]]">[[ todo.text ]]</span>
</li>
```



## b-link

Client-side navigation (prevents page reload).

### Basic Usage

```html
<a href="/" b-link>Home</a>
<a href="/about" b-link>About</a>
<a href="/contact" b-link>Contact</a>
```

### With Dynamic Routes

```html
<a href="/user/[[ userId ]]" b-link>View Profile</a>
<a href="/product/[[ productId ]]" b-link>[[ productName ]]</a>
```

::: tip Router Required
`b-link` only works if you've set up routing with `Lego.route()`.
:::

## b-logic

Initialize block state (logic).

### Basic Usage

```html
<my-block b-logic="{ count: 0, name: 'Alice' }"></my-block>
```

### With Complex Data

```html
<todo-list b-logic="{
  todos: [
    { text: 'Learn Lego', done: true },
    { text: 'Build app', done: false }
  ],
  filter: 'all'
}"></todo-list>
```

### Merging with Defaults

```js
// Block definition
Lego.block('user-card', `...`, {
  name: 'Guest',  // Default
  role: 'user'    // Default
});
```

```html
<!-- Only name is overridden -->
<!-- role remains 'user' -->
<user-card b-logic="{ name: 'Alice' }"></user-card>
<!-- role remains 'user' -->
```

## b-stylesheets

Applies shared CSS stylesheets to a block's Shadow DOM. Stylesheets are defined in `Lego.init()` and referenced by key.

**Setup:**

```js
Lego.init(document.body, {
  styles: {
    base: ['/styles/reset.css', '/styles/typography.css'],
    forms: ['/styles/forms.css']
  }
});
```

::: tip Using with Vite
**Required:** Place CSS files in the `/public/` directory (e.g., `/public/styles/theme.css`). Vite serves files from `public/` as static assets, ensuring LegoDOM receives raw CSS instead of JavaScript modules.
:::

**Usage in templates:**

```html
<template b-id="my-form" b-stylesheets="base forms">
  <form>...</form>
</template>
```

**Usage in .lego files:**

```html
<template b-stylesheets="base forms">
  <form>...</form>
</template>
```

Multiple keys can be space-separated. The stylesheets are loaded once and shared across all blocks using `adoptedStyleSheets`.

## b-error

Defines an error boundary that gracefully handles crashes in your blocks. When a block throws an error during rendering, lifecycle hooks, or event handlers, the nearest `b-error` boundary will catch it and display a fallback block.

### How It Works

Error boundaries use a **cascading** strategy:

1. **Template-Level (Default)**: Define on the block's template in the `.lego` file
2. **Instance-Level (Override)**: Define on a specific instance in HTML
3. **Parent Bubbling**: If a block has no `b-error`, the error bubbles up to the nearest parent boundary

### Basic Usage

**Define the Error Block:**

```html
<!-- error-card.lego -->
<template>
  <div class="error-card">
    <h3>Something went wrong</h3>
    <!-- Access in Template Space: direct variable -->
    <p>[[ $error.message ]]</p>
    <button @click="retry()">Retry</button>
  </div>
</template>

<script>
  export default {
    retry() {
      // Access in Script Space: use this.$error
      console.log('Retrying error:', this.$error);
      location.reload();
    }
  }
</script>

<style>
  .error-card {
    padding: 20px;
    background: #fee;
    border: 1px solid #c33;
    border-radius: 8px;
  }
</style>
```

### Accessing Error Details

The `$error` object (`{ message, stack, component }`) is injected into the error block's state and can be accessed in three ways:

1.  **Template Space**: Use `[[ $error ]]` directly.
    ```html
    <p>Error: [[ $error.message ]]</p>
    ```

2.  **Script Space**: Use `this.$error`.
    ```javascript
    export default {
      mounted() {
        console.log('Crashed component:', this.$error.component);
      }
    }
    ```

3.  **External Space**: Use `element.state.$error`.
    ```javascript
    const errorCard = document.querySelector('error-card');
    console.log(errorCard.state.$error.message);
    ```

**Use in Template:**

```html
<!-- user-dashboard.lego -->
<template b-error="error-card">
  <user-profile></user-profile>
  <user-stats></user-stats>
  <activity-feed></activity-feed>
</template>
```

**Result:** If any of the child blocks (`user-profile`, `user-stats`, or `activity-feed`) crashes, the entire `user-dashboard` will be replaced with `<error-card>`.

### Cascading Error Boundaries

Error boundaries bubble up the component tree:

```html
<!-- app-shell.lego -->
<template b-error="global-error">
  <header-bar></header-bar>
  
  <!-- Dashboard has its own boundary -->
  <user-dashboard b-error="dashboard-error"></user-dashboard>
  
  <!-- Sidebar has no boundary, uses parent's -->
  <sidebar-panel></sidebar-panel>
</template>
```

**Behavior:**
- If `<user-dashboard>` crashes → Shows `<dashboard-error>`
- If `<sidebar-panel>` crashes → Shows `<global-error>` (bubbles to parent)
- If `<header-bar>` crashes → Shows `<global-error>`

### Instance-Level Overrides

Override the default error boundary for specific instances:

```html
<template b-error="default-error">
  <!-- Uses template default -->
  <user-card></user-card>
  
  <!-- Override with custom error -->
  <payment-form b-error="critical-error"></payment-form>
</template>
```

### Accessing Error Information

The error block receives a `$error` object in its state:

```html
<!-- debug-error.lego -->
<template>
  <div class="error-debug">
    <h3>Error in [[ $error.component ]]</h3>
    <p><strong>Message:</strong> [[ $error.message ]]</p>
    <details>
      <summary>Stack Trace</summary>
      <pre>[[ $error.stack ]]</pre>
    </details>
  </div>
</template>
```

**`$error` Properties:**
- `message`: The error message
- `stack`: The error stack trace
- `component`: The tag name of the crashed block (e.g., `"user-card"`)

### Best Practices

✅ **Define Global Boundaries**

```html
<!-- app.html -->
<body b-error="app-error">
  <router-view></router-view>
</body>
```

This ensures all crashes are caught, even if individual blocks don't define boundaries.

✅ **Create Reusable Error Blocks**

```html
<!-- error-card.lego - Generic -->
<template>
  <div class="error">
    <p>[[ $error.message ]]</p>
    <button @click="$emit('retry')">Retry</button>
  </div>
</template>

<!-- critical-error.lego - For Critical Features -->
<template>
  <div class="critical-error">
    <h2>Critical Error</h2>
    <p>Please contact support: support@example.com</p>
    <p>Error ID: [[ $error.component ]]-[[ Date.now() ]]</p>
  </div>
</template>
```

✅ **Use Specific Boundaries for Critical Features**

```html
<checkout-flow b-error="payment-error">
  <payment-form></payment-form>
</checkout-flow>

<user-settings b-error="settings-error">
  <preferences-panel></preferences-panel>
</user-settings>
```

❌ **Don't Over-Isolate**

```html
<!-- ❌ Too granular -->
<card-list>
  <user-card b-error="error-card"></user-card>
  <user-card b-error="error-card"></user-card>
  <user-card b-error="error-card"></user-card>
</card-list>

<!-- ✅ Better: One boundary for the list -->
<card-list b-error="error-card">
  <user-card></user-card>
  <user-card></user-card>
  <user-card></user-card>
</card-list>
```

### When Boundaries Trigger

Error boundaries catch errors in:

- **Rendering**: Errors during template evaluation
- **Lifecycle Hooks**: Errors in `mounted()` or `unmounted()`
- **Event Handlers**: Errors in `@click`, `@input`, etc.

### Fallback to Console

If no error boundary is found, LegoDOM falls back to `config.onError`, which by default logs to the console:

```javascript
Lego.init(document.body, {
  onError: (err, type, el) => {
    console.error(`[Lego Error] [${type}]`, err, el);
    // Optionally send to error tracking service
    Sentry.captureException(err);
  }
});
```

## b-cascade

The `b-cascade` attribute allows you to selectively propagate stylesheets to child blocks, enabling theme systems and design tokens to cascade through your component tree.

### Inheritance Rules

1. **Merge strategy**: Inherited styles are applied first, followed by explicit styles.
2. **Explicit wins**: Explicit `b-stylesheets` take precedence over inherited ones in the cascade order.
3. **Deduplication**: Duplicate stylesheets are automatically removed.

### Basic Usage

```html
<parent-block b-stylesheets="theme-a theme-b" b-cascade="theme-a">
  <child-block></child-block>
</parent-block>
```

**Result:** `child-block` automatically inherits `theme-a` (but NOT `theme-b`).

### Best Practices

✅ **Use for Global Themes and Design Systems**

Use `b-cascade` exclusively for styles that should be available app-wide:

```html
<body b-stylesheets="design-tokens typography" b-cascade="design-tokens typography">
  <!-- All blocks inherit design tokens and typography -->
  <my-header></my-header>
  <my-content></my-content>
  <my-footer></my-footer>
</body>
```

**Good use cases:**
- **Design tokens** (CSS custom properties: colors, spacing, breakpoints)
- **Typography scales** (font families, sizes, weights)
- **Reset/normalize stylesheets**
- **Utility systems** (if using Tailwind/similar)
- **Theme switches** (light/dark mode)

❌ **Don't Use for Block-Specific Styles**

If styles belong to a specific block, put them in that block's `<style>` tag instead:

```html
<!-- ❌ BAD: Cascading block-specific styles -->
<user-profile b-stylesheets="card-styles user-button-styles" b-cascade="user-button-styles">
  <user-avatar></user-avatar> <!-- Gets button styles it doesn't need! -->
</user-profile>
```

```html
<!-- ✅ GOOD: Block-specific styles in the block -->
<!-- user-avatar.lego -->
<template>
  <img src="[[avatarUrl]]" alt="Avatar">
</template>

<style>
  img {
    width: 48px;
    height: 48px;
    border-radius: 50%;
  }
</style>
```

**Why?** Cascading block-specific styles makes debugging necessary, since you won't know why a block is receiving styles it shouldn't have without `Lego.debug.stylesheets()`. 

**Rule of thumb:** If you designed your design system well, you only need `b-cascade` for global theming. Everything else belongs in `<style>` tags.

### Debugging

You can inspect which stylesheets are applied (explicit vs inherited) using the debug helper:

```javascript
Lego.debug.stylesheets(document.querySelector('my-block'));
// Returns: { explicit: [...], inherited: [...], applied: [...] }
```


## b-enter & b-leave

Trigger expressions when an element enters or leaves the viewport (Intersection Observer).

### Basic Usage

Perfect for animations, lazy loading, or analytics visibility tracking.

```html
<div b-enter="playAnimation()" b-leave="resetAnimation()">
  Scroll to see me animate!
</div>
```

### The `.once` Modifier

If you want the event to trigger **only the first time** it happens (e.g., for entrance animations that shouldn't repeat or "seen" analytics), use the `.once` modifier.

```html
<!-- Only tracks variables once -->
<img src="placeholder.jpg" b-enter.once="loadRealImage()">

<!-- Only logs analytics once -->
<div b-enter.once="logView('ad-banner')"></div>
```

**Note:** The `.once` modifier automatically disconnects the internal Observer after firing, freeing up resources.

## Combining Directives

### b-show + b-for

```html
<li b-for="item in items" b-show="item.visible">
  [[ item.name ]]
</li>
```

### b-for + b-sync

```html
<li b-for="todo in todos">
  <input type="checkbox" b-sync="todo.done">
  [[ todo.text ]]
</li>
```

### Multiple Events

```html
<input 
  @input="handleInput()" 
  @focus="onFocus()" 
  @blur="onBlur()">
```

## Best Practices

### 1. Use b-show for Show/Hide

```html
<!-- ✅ Clean -->
<div b-show="showPanel">Panel content</div>

<!-- ❌ Verbose -->
<div style="display: [[ showPanel ? 'block' : 'none' ]]">Panel content</div>
```

### 2. Keep Event Handlers Simple

```html
<!-- ✅ Good -->
<button @click="increment()">+1</button>

<!-- ❌ Too much logic -->
<button @click="count++; total = count * price; updateDisplay()">Calculate</button>
```

Move complex logic to methods.

### 3. Use b-sync for Forms

```html
<!-- ✅ Declarative -->
<input b-sync="username">

<!-- ❌ Imperative -->
<input @input="username = event.target.value">
```

### 4. Avoid Deep Nesting in b-for

```html
<!-- ❌ Hard to read -->
<div b-for="cat in categories">
  <div b-for="sub in cat.subcategories">
    <div b-for="item in sub.items">...</div>
  </div>
</div>

<!-- ✅ Break into blocks -->
<category-list></category-list>
```

## Performance Tips

### b-show vs b-if

- **`b-show`** toggles `display: none`. The element remains in the DOM, maintaining its state (e.g., input values, scroll position). Use this for elements that toggle **frequently** (like dropdowns or tabs).
- **`b-if`** adds/removes the element from the DOM. When removed, all internal state is destroyed and listeners attached to it are cleaned up. Use this for elements that are **rarely** shown (like a modal that might never open) or conditionally rendered branches that differ significantly.

**Rule of Thumb:**
- Toggle often? Use **`b-show`**.
- Toggle rarely? Use **`b-if`**.

### Limit b-for Items

Paginate large lists:

```js
{
  allItems: [...],  // 1000 items
  currentPage: 1,
  itemsPerPage: 20,
  
  visibleItems() {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    return this.allItems.slice(start, start + this.itemsPerPage);
  }
}
```

```html
<li b-for="item in visibleItems()">[[ item.name ]]</li>
```

## Common Patterns

### Toggle

```html
<button @click="visible = !visible">Toggle</button>
<div b-show="visible">Content</div>
```

### Counter

```html
<button @click="count--">-</button>
<span>[[ count ]]</span>
<button @click="count++">+</button>
```

### Todo List

```html
<input b-sync="newTodo" @keyup="event.key === 'Enter' && addTodo()">
<ul>
  <li b-for="todo in todos">
    <input type="checkbox" b-sync="todo.done">
    <span class="[[ todo.done ? 'done' : '' ]]">[[ todo.text ]]</span>
  </li>
</ul>
```

### Tabs

```html
<nav>
  <button @click="activeTab = 'home'">Home</button>
  <button @click="activeTab = 'profile'">Profile</button>
  <button @click="activeTab = 'settings'">Settings</button>
</nav>

<div b-show="activeTab === 'home'">Home content</div>
<div b-show="activeTab === 'profile'">Profile content</div>
<div b-show="activeTab === 'settings'">Settings content</div>
```

## See Also

Some directives are specific to certain features and are documented in their respective guides:

### Block Directives

- **`b-id`**: Defines a block from a template.
- **`b-logic`**: Passes initial state/logic to a block.
- See [Blocks Guide](/guide/blocks)



### Routing Directives

- **`b-target`**: Specifies the target element for surgical routing updates.
- **`b-link`**: Controls browser history behavior for links.
- See [Routing Guide](/guide/routing)

## Next Steps

- See [directive examples](/examples/)
- Learn about [event handling](/guide/directives#event)
- Explore [form patterns](/examples/form)
