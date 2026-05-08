# Testing LegoDOM Blocks

Testing `.lego` blocks is straightforward because they compile into standard **Web Components**. You can use any modern testing runner (like **Vitest**), as long as you have a DOM environment like **JSDOM** or **Happy DOM**.

## Setup Vitest with JSDOM

In your `vitest.config.js`, ensure you have the `legoPlugin` and a browser-like environment:

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config';
import { legoPlugin } from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [legoPlugin()],
  test: {
    environment: 'jsdom', // Essential for Web Components
  },
});
```

## Writing a Test

Since a Lego block is a standard Custom Element, you mount it and inspect its `shadowRoot`.

```javascript
// user-profile.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import './src/user-profile.lego'; // Import the SFB

describe('UserProfile Block', () => {
  let el;

  beforeEach(() => {
    // 1. Mount the block to the DOM
    document.body.innerHTML = '<user-profile name="Lego"></user-profile>';
    el = document.querySelector('user-profile');
  });

  it('should render the name correctly', () => {
    // 2. Query the Shadow DOM
    const div = el.shadowRoot.querySelector('div');
    expect(div.textContent).toContain('Hello Lego');
  });

  it('should update UI when state changes', async () => {
    // 3. Trigger logic
    el.setState({ name: 'Master Builder' });

    // 4. Wait for LegoDOM's batcher to sync the DOM
    await new Promise(res => setTimeout(res, 50)); 

    const div = el.shadowRoot.querySelector('div');
    expect(div.textContent).toContain('Hello Master Builder');
  });
});
```

## Testing Strategies

### Logic Isolation
You can access the internal logic object through the custom element instance for unit testing:
`el.logic.someMethod()`.

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
