# Lifecycle Hooks

Three hooks. They live on the block's logic object alongside state and methods.

```js
{
  count: 0,
  mounted()   { /* attach */ },
  updated()   { /* react to DOM change */ },
  unmounted() { /* detach */ }
}
```

## mounted()

Runs after the block's template is in the DOM, the Shadow DOM is attached, styles applied, and the first render has finished. By this point:

- `this.$element` references the host element.
- `this.$vars` is populated with any `b-var` refs.
- The state proxy is live, mutating any property triggers a re-render.

The hook fires **before** child blocks inside this block snap, so any state you set in `mounted()` is visible to children when they mount.

```js
{
  user: null,
  async mounted() {
    this.user = await fetch('/api/me').then(r => r.json());
  }
}
```

If `mounted()` throws, the error is caught and routed to the nearest [error boundary](/api/directives#b-error), your block doesn't have to crash the page.

## updated()

Runs ~50 ms after a render cycle completes (a trailing-only debounce). The debounce is intentional: it absorbs bursts of mutations from animations, websockets, or rapid user input so the hook fires once per logical "tick" instead of once per RAF.

```js
{
  updated() {
    // The DOM reflects the latest state by now
    this.$vars.scroller.scrollTop = 0;
  }
}
```

`updated()` does **not** fire on initial mount, only on subsequent renders.

## unmounted()

Runs when the host element is removed from the DOM (or `Lego.unsnap()` is called explicitly). Use it to dispose of anything that won't be cleaned up automatically, timers, websocket connections, third-party libraries.

```js
{
  timer: null,
  mounted()   { this.timer = setInterval(this.tick.bind(this), 1000); },
  unmounted() { clearInterval(this.timer); },
  tick() { /* … */ }
}
```

You don't need to remove DOM event listeners attached via `@event` or `b-sync`, those are tracked and cleaned up automatically. Same for `IntersectionObserver` instances created by `b-enter` / `b-leave`.

## Order of operations

For a block being mounted into the DOM:

1. Template cloned, Shadow DOM attached, styles adopted.
2. State proxy built (script logic → template `b-logic` → instance `b-logic`, with the parent block's state as scope).
3. Bindings scanned, event listeners bound, first render runs.
4. **`mounted()` fires.**
5. Child blocks inside the template are snapped recursively.

For unmount:

1. **`unmounted()` fires.**
2. Listeners removed, observers disconnected.
3. Persistence bindings cleaned up.
4. Children recursively unmounted.

## Accessing `this`

Inside hooks and methods, `this` is the **reactive proxy** of your state, every read is tracked, every write triggers a re-render.

```js
{
  count: 0,
  mounted() {
    setTimeout(() => this.count++, 1000); // triggers a re-render
  }
}
```

If you need the raw element (e.g. to call `closest()` or interact with native APIs), use `this.$element`.

## Async hooks

Hooks may return promises. The runtime does not wait for them, your block renders synchronously and the promise resolves whenever it resolves. If the host element is unmounted while the promise is in-flight, guard with `this.$element` (which is nulled in `unmounted`):

```js
async mounted() {
  const data = await fetch('/api/data').then(r => r.json());
  if (!this.$element) return;     // unmounted while we were waiting
  this.data = data;
}
```
