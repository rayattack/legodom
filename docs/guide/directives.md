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

## b-for

List rendering.

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

Use `$index` (implicit variable):

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

## @event

Event handlers.

### Common Events

```html
<!-- Click -->
<button @click="handleClick()">Click Me</button>

<!-- Input -->
<input @input="handleInput()">

<!-- Change -->
<select @change="handleChange()">...</select>

<!-- Submit -->
<form @submit="handleSubmit(event)">...</form>

<!-- Focus/Blur -->
<input @focus="onFocus()" @blur="onBlur()">

<!-- Mouse Events -->
<div @mouseenter="onHover()" @mouseleave="onLeave()">Hover me</div>

<!-- Keyboard -->
<input @keyup="onKeyUp(event)" @keydown="onKeyDown(event)">
```

### Event Object

Access the native event object:

```html
<button @click="handleClick(event)">Click</button>
```

```js
{
  handleClick(event) {
    console.log('Target:', event.target);
    console.log('Type:', event.type);
    event.preventDefault();
    event.stopPropagation();
  }
}
```

### Inline Expressions

```html
<button @click="count++">Increment</button>
<button @click="items.push('new item')">Add Item</button>
<button @click="$emit('save', { id: 123 })">Save</button>
```

### Key Events

```html
<input @keyup="event.key === 'Enter' && submit()">
<input @keydown="event.key === 'Escape' && cancel()">
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

## b-data

Initialize component state.

### Basic Usage

```html
<my-component b-data="{ count: 0, name: 'Alice' }"></my-component>
```

### With Complex Data

```html
<todo-list b-data="{
  todos: [
    { text: 'Learn Lego', done: true },
    { text: 'Build app', done: false }
  ],
  filter: 'all'
}"></todo-list>
```

### Merging with Defaults

```js
// Component definition
Lego.define('user-card', `...`, {
  name: 'Guest',  // Default
  role: 'user'    // Default
});
```

```html
<!-- Only name is overridden -->
<user-card b-data="{ name: 'Alice' }"></user-card>
<!-- role remains 'user' -->
```

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

<!-- ✅ Break into components -->
<category-list></category-list>
```

## Performance Tips

### b-show vs CSS

`b-show` is fine for most cases, but for frequently toggled elements, use CSS:

```html
<!-- For frequent toggling -->
<div class="[[ visible ? '' : 'hidden' ]]">Content</div>
```

```css
.hidden {
  display: none;
}
```

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

### Component Directives

- **`b-id`**: Defines a component from a template.
- **`b-styles`**: Applies shared styles to a component.
- See [Components Guide](/guide/components)

### Routing Directives

- **`b-target`**: Specifies the target element for surgical routing updates.
- **`b-link`**: Controls browser history behavior for links.
- See [Routing Guide](/guide/routing)

## Next Steps

- See [directive examples](/examples/)
- Learn about [event handling](/guide/directives#event)
- Explore [form patterns](/examples/form)
