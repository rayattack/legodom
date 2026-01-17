# Helper Utilities

LegoDOM provides a set of instance properties and methods available within your component's logic and templates. These helpers provide access to the DOM, navigation, events, and component hierarchy.

## $element

**Type:** `HTMLElement`

The root DOM element of the current component instance. Use this when you need direct access to the native DOM node.

```js
{
  mounted() {
    console.log(this.$element.tagName); // e.g., "USER-CARD"
    this.$element.scrollIntoView();
  }
}
```

## $emit(name, detail)

**Type:** `Function`

Dispatches a custom event from the component. This is the primary way for children to communicate with parents.

- **name**: `String` - The name of the event.
- **detail**: `Any` - The data to pass with the event.

The event bubbles and is composed, meaning it can cross Shadow DOM boundaries.

```html
<button @click="$emit('save', { id: 123 })">Save</button>
```

```js
// In parent
<user-card @save="handleSave(event.detail)"></user-card>
```

## $ancestors(tagName)

**Type:** `Function`

Finds the nearest ancestor component with the specified tag name. This is useful for dependency injection or communicating with a specific parent container.

- **tagName**: `String` - The tag name of the ancestor to find (case-insensitive).
- **Returns**: `HTMLElement | undefined`

```js
{
  mounted() {
    const parent = this.$ancestors('form-wizard');
    if (parent) {
      console.log('Wizard Step:', parent.state.currentStep);
    }
  }
}
```

::: warning Read-Only Recommended
While you *can* modify the parent's state, it is generally better to use events (`$emit`) for child-to-parent communication to maintain unidirectional data flow.
:::

## $route

**Type:** `Object` (Reactive)

Access the current route state. This object is globally reactive and shared across all components.

Properties:
- **url**: `String` - Full URL with query string.
- **route**: `String` - The matched route pattern (e.g., `/user/:id`).
- **params**: `Object` - Route parameters (e.g., `{ id: '123' }`).
- **query**: `Object` - Query parameters (e.g., `{ sort: 'desc' }`).
- **method**: `String` - The HTTP method used (GET, POST, etc.) for surgical swaps.

```html
<h1>User ID: [[ $route.params.id ]]</h1>
<div b-if="$route.query.edit">Editing Mode</div>
```

## $go(path, ...targets)

**Type:** `Function`

Programmatic navigation helper.

- **path**: `String` - The URL to navigate to.
- **targets**: `String...` - Optional IDs or selectors for surgical updates.

Returns an object with HTTP method helpers:
- `.get(pushState = true)`
- `.post(data, pushState = true)`
- `.put(data, pushState = true)`
- `.patch(data, pushState = true)`
- `.delete(pushState = true)`

```js
// Simple navigation
this.$go('/home').get();

// Surgical swap (updates only #content)
this.$go('/settings', '#content').get();

// POST request with data
this.$go('/submit', '#result').post({ name: 'Alice' });
```

## $vars

**Type:** `Object`

A dictionary of elements marked with the `b-var` directive inside the component.

```html
<input b-var="usernameInput">
<button @click="$vars.usernameInput.focus()">Focus</button>
```

## $registry(tagName)

**Type:** `Function`

Access the shared state of another component type. This allows for cross-component communication via a shared global store pattern.

- **tagName**: `String` - The tag name of the component registry to access.

```js
// In a shopping cart component
const store = this.$registry('product-store');
```
