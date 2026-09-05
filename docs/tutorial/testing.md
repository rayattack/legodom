# Testing LegoDOM Blocks

Testing `.lego` blocks is straightforward because they compile into standard **Web Components**. You can use any modern testing runner (like **Vitest**), as long as you have a DOM environment like **JSDOM** or **Happy DOM**.

## Setup Vitest with JSDOM

In your `vitest.config.js`, ensure you have the Lego plugin and a browser-like environment. The plugin is a **default export**:

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [legoPlugin()],
  test: {
    environment: 'jsdom', // Essential for Web Components
  },
});
```

## Writing a Test

Since a Lego block is a standard Custom Element, you mount it and inspect its `shadowRoot`.

State lives on `el.state`. Read a value with `el.state.name`, write one with
`el.state.name = 'x'`, and call a method with `el.state.someMethod()`. Assigning
to `el.state` itself performs a **shallow merge**, so `el.state = { name: 'x' }`
updates `name` and leaves every other key in place.

```javascript
// user-profile.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import Lego from 'lego-dom';
import './src/user-profile.lego'; // Import the SFB

describe('UserProfile Block', () => {
  let el;

  beforeEach(async () => {
    // 1. Mount the block to the DOM
    document.body.innerHTML = '<user-profile name="Lego"></user-profile>';
    el = document.querySelector('user-profile');

    // 2. Let the first render land
    await Lego.nextTick();
  });

  it('should render the name correctly', () => {
    // 3. Query the Shadow DOM
    const div = el.shadowRoot.querySelector('div');
    expect(div.textContent).toContain('Hello Lego');
  });

  it('should update UI when state changes', async () => {
    // 4. Mutate state directly (shallow merge via `el.state = {...}` also works)
    el.state.name = 'Master Builder';

    // 5. Wait for LegoDOM's batcher to commit the DOM
    await Lego.nextTick();

    const div = el.shadowRoot.querySelector('div');
    expect(div.textContent).toContain('Hello Master Builder');
  });
});
```

## Testing Strategies

### Waiting for renders

`Lego.nextTick()` resolves once the batcher has committed the pending batch to
the DOM. Prefer it over an arbitrary `setTimeout`.

```javascript
el.state.count = 5;
await Lego.nextTick();
expect(el.shadowRoot.querySelector('span').textContent).toBe('5');
```

The `updated()` hook is debounced separately (about 50ms after the first
mutation in a burst), so a test asserting on `updated()` still needs a short
timer rather than `nextTick()`.

### Logic Isolation

Block methods are reachable through the same `state` accessor, so you can unit
test them without going through the DOM:

```javascript
el.state.increment();
await Lego.nextTick();
expect(el.state.count).toBe(1);
```

### Event Testing
Test `$emit` by adding an event listener to the element:
```javascript
it('emits an event', () => {
  let fired = false;
  el.addEventListener('saved', () => fired = true);
  el.shadowRoot.querySelector('button').click();
  expect(fired).toBe(true);
});
```

### Shadow Boundaries
Always remember to query inside `el.shadowRoot`. Standard `document.querySelector` will not find elements inside your block's template.

### Constructable Stylesheets
If you use `b-stylesheets`, you can verify they are applied by checking `el.shadowRoot.adoptedStyleSheets`.
