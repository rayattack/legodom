# Advanced API

Methods that the average app never reaches for, but that exist for testing, devtools, manual mounting, and bespoke loaders.

## Lego.snap()

Manually mount a block element. Equivalent to what `connectedCallback` does for elements inserted into the light DOM.

```ts
Lego.snap(el: HTMLElement): void
```

Steps:

1. No-op if `el` is already snapped.
2. Clone the registered template, attach Shadow DOM, adopt stylesheets.
3. Build the state proxy (script → template `b-logic` → instance `b-logic`).
4. Walk the shadow tree, attach event listeners, scan for bindings, first render.
5. Fire `mounted()`.
6. Recursively snap nested registered blocks inside the shadow tree.

The most common reason to call `snap()` is **inside another Shadow DOM**, `MutationObserver` doesn't watch shadow trees, and the manifest/loader paths only re-fire for elements connecting to the light DOM tree.

```js
const card = document.createElement('user-card');
container.shadowRoot.appendChild(card);
Lego.snap(card); // observer didn't see it; do it manually
```

## Lego.unsnap()

Tear down a block. Symmetric to `snap()`.

```ts
Lego.unsnap(el: HTMLElement): void
```

Steps:

1. Fire `unmounted()`.
2. Remove all event listeners attached via `@event` and `b-sync`.
3. Disconnect `IntersectionObserver` instances from `b-enter` / `b-leave`.
4. Clean up `$db` bindings on the element.
5. Drop the element from `activeBlocks` and `globalSubscribers`.
6. Break circular refs (`$element`, `$vars`, `$emit`, `$parent`, `$route`, `$go`, `$mount`).
7. Recursively unsnap child blocks.

Calling `unsnap()` is rarely needed, element removal triggers `disconnectedCallback`, which calls it for you. Use it explicitly when you're swapping content programmatically and want clean teardown before reattachment.

## Lego.mount()

Imperative mount. Powers both [`b-mount`](/api/directives#b-mount) and the global [`$mount`](/api/globals#mount) helper.

```ts
Lego.mount(
  tagName: string | null,
  target?: string | HTMLElement | HTMLElement[],
  props?: object
): HTMLElement | HTMLElement[] | undefined
```

| Form | Effect | Returns |
|---|---|---|
| `mount('user-card')` | Create a detached `<user-card>` | the element |
| `mount('user-card', '#main')` | Clear `#main`, mount one `<user-card>` | the element |
| `mount('user-card', '.row', { id: 1 })` | For each `.row`: clear, mount with `$initialState = { id: 1 }` | array (or single el) |
| `mount(null, '#main')` | Clear `#main` (no mount) | `undefined` |

`tagName` must contain a hyphen (custom-element rules), otherwise a console warning is emitted and nothing is mounted.

`props` is injected onto the host element as `$initialState` before the element connects, so `mounted()` can see them via the merge into state.

## Lego.db()

Persistence factory. Returns a descriptor that can be:

- assigned into block state (acts as a reactive, persisted property);
- used directly to read/write the underlying storage.

```ts
Lego.db(key: string): {
  default(v: any):       this;       // init-time, fluent
  debounce(ms: number):  this;       // init-time, fluent
  set(value: any, debounceMs?: number): any;  // runtime
  get(): any;                         // runtime
  delete(): boolean;                  // runtime
}
```

### As a reactive state property

When the descriptor is assigned to a key inside a block's logic, the runtime hydrates it into a regular reactive value: any read from `localStorage` is performed at mount time, and any subsequent write to the property is debounced and persisted.

```js
{
  theme: $db('theme').default('light'),
  draft: $db('draft.signup').default('').debounce(500)
}
```

```html
<select b-sync="theme">
  <option>light</option>
  <option>dark</option>
</select>
```

Cross-tab sync is automatic, every other tab with bindings to the same key receives the new value via the `storage` event.

### Direct usage from JS

```js
Lego.db('user').set({ name: 'Alice' });          // immediate write
Lego.db('user').set({ name: 'Bob' }, 200);       // debounced write
const u = Lego.db('user').get();                 // synchronous read
Lego.db('user').delete();                        // remove + notify
```

`Lego.db` is also exposed as `Lego.globals.$db` and as `$db` inside expression scope.

### Quota handling

When a write exceeds `localStorage` quota, the runtime evicts the oldest tracked keys (FIFO) to free at least 2× the space needed, then retries. Eviction only applies to keys this app wrote, third-party `localStorage` usage is left alone. If eviction can't free enough space, `config.onError` is called with `type: 'quota-critical'`.

## Introspection

```ts
Lego.getLegos(): string[]               // all registered tag names
Lego.getActiveBlocksCount(): number     // currently snapped blocks
```

## Debug

```ts
Lego.debug.stylesheets(el: HTMLElement): { explicit: string[]; inherited: string[]; applied: string[] } | null
```

Returns the stylesheet keys that resolved for an element, what was declared on the template, what cascaded in from ancestors, and the deduped final list. `null` if the element hasn't been snapped or doesn't carry stylesheet metadata.

```js
Lego.debug.stylesheets(document.querySelector('user-card'));
// { explicit: ['cards'], inherited: ['design-tokens'], applied: ['design-tokens', 'cards'] }
```
