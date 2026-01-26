# Reactive Persistence ($db)

LegoDOM provides a powerful `$db` helper to make persisting state to `localStorage` redundant-free and reactive.

Unlike manually reading/writing to `localStorage` in lifecycle hooks, `$db` treats persistent data as first-class reactive state. It also adds robust features like debouncing and cross-tab synchronization automatically.

## Quick Example

Use the `$db` helper in your `b-logic`:

```html
<user-prefs b-logic="{
  theme: $db('app.theme').default('light'),
  volume: $db('app.vol').default(50).debounce(300)
}"></user-prefs>

<template>
  <h1>Current Theme: [[ theme ]]</h1>
  <input type="range" b-sync="volume">
</template>
```

When you drag the slider, the value is updated in memory instantly, but written to disk only after you stop dragging (300ms debounce). If you open the app in another tab, the theme update will sync instantly!

## API Reference

### `$db(key: string)`

Creates a reactive connection to `localStorage` for the given key.

**What does "Reactive Connection" mean?**
1.  **Auto-Load:** When the block is created, it checks `localStorage`. If the key exists, it initializes your state with that value (parsing JSON automatically).
2.  **Auto-Save:** Whenever you modify this property (e.g., `this.state.theme = 'dark'`), LegoDOM automatically saves the new value to `localStorage`.
3.  **Two-Way Binding:** It behaves exactly like a normal variable, but it survives page reloads.

:::{warning}
**Namespacing is Critical!**
`localStorage` is shared by all code on your domain.
Avoid generic keys like `"theme"` or `"user"`.
Always use a namespace prefix: `"my-app.theme"` or `"user.123.prefs"`.
:::

### `.default(value: any)`

Sets the initial value if the key does not exist in storage.

- **value**: Can be a string, number, boolean, object, or array. (Automatically JSON serialized/parsed).

```javascript
$db('app.counter').default(0)
$db('app.settings').default({ notifications: true })
```

### `.debounce(ms: number)`

Delays the *write to disk* operation.

- **ms**: Milliseconds to wait after the last change.

:::{danger}
**Performance Warning**
`localStorage` is synchronous and blocking. Writing to it on every frame (e.g., during a scroll event or slider drag) will cause **UI Jank** on mobile devices.
**ALWAYS** use `.debounce(300)` or higher for values bound to high-frequency inputs like `<input type="range">` or text fields.
:::

## Runtime Methods

In addition to reactive persistence (using `.default()` and `.debounce()`), you can perform one-off operations directly from methods or templates:

### `.set(value: any, debounce?: number)`

Writes a value to localStorage and triggers reactivity for all components using this key.

```javascript
// In a method
logout() {
  $db('auth-token').set(null);
}

// In a template
<button @click="$db('theme').set('dark')">Dark Mode</button>
```

**Parameters:**
- `value`: The data to save (automatically JSON serialized)
- `debounce` (optional): Milliseconds to wait before writing to disk (default: 0)

**Returns:** The saved value

### `.get()`

Reads the current value from localStorage.

```javascript
mounted() {
  const token = $db('auth-token').get();
  if (token) this.authenticate(token);
}
```

**Returns:** The parsed value, or `null` if the key doesn't exist

### `.delete()`

Removes the key from localStorage and notifies all reactive bindings.

```javascript
clearCache() {
  $db('user-cache').delete();
}
```

**Returns:** `true` if successful, `false` on error

> **Note:** Unlike reactive properties (which require declaring `myProp: $db('key').default(val)` in your component), these runtime methods can be called anywhere without prior declaration.

## Cross-Tab Synchronization

One of the "magic" features of `$db` is automatic synchronization.

1.  Open your app in **Tab A**.
2.  Open your app in **Tab B**.
3.  Change a `$db` value in Tab A.
4.  Tab B will **instantly update** and re-render.

This uses the browser's native `storage` event. We filter these events efficiently (O(1) complexity), so there is negligible performance cost to having this active.

## Usage in .lego Files

In your `.lego` files, use `$db` directly in your exported object:

```html
<!-- user-card.lego -->
<template>
  <div>History: [[ history.length ]] items</div>
</template>

<script>
export default {
  history: $db('app.history').default([]),
  tempValue: 0,
  
  mounted() {
    console.log(this.state.history); // Already loaded from disk!
  },

  addToHistory(item) {
    this.state.history.push(item); 
  }
}
</script>
```
