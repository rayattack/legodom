# Batching, Scheduling, and doing things the right way

Say you are building the next big thing, if you update checkboxes, input fields a 100 times,
you don't want the DOM to re-render 100 times. That would be a performance nightmare.
LegoDOM uses Batching & Scheduling to do things the right way.

## Topic 3: The Global Batcher & Scheduler

When you change data in a reactive application, you often change multiple things at once (e.g., updating a user's name, age, and profile picture). Without a **Batcher**, the browser would try to re-render the HTML every single time one of those properties changed. This would cause "jank" (stuttering) and poor performance.

## Location in the Codebase

The batcher lives in `src/core/batcher.js`:

```js
// src/core/batcher.js
export const createBatcher = () => {
  let queued = false;
  const blocksToUpdate = new Set();
  let isProcessing = false;
  let handler = null;

  return {
    setHandler: (fn) => {
      handler = fn;
    },
    add: (el) => {
      if (!el || isProcessing) return;
      blocksToUpdate.add(el);
      if (queued) return;
      queued = true;

      requestAnimationFrame(() => {
        isProcessing = true;
        const batch = Array.from(blocksToUpdate);
        blocksToUpdate.clear();
        queued = false;

        // Call the render function for each block
        batch.forEach(el => handler && handler(el));

        setTimeout(() => {
          batch.forEach(el => {
            const state = el._studs;
            if (state && typeof state.updated === 'function') {
              try {
                state.updated.call(state);
              } catch (e) {
                console.error(`[Lego] Error in updated hook:`, e);
              }
            }
          });
          isProcessing = false;
        }, 0);
      });
    }
  };
};

export const globalBatcher = createBatcher();
```

### Dependency Injection

The batcher doesn't know about `render()` directly. Instead, `src/index.js` performs dependency injection:

```js
// src/index.js
import { globalBatcher } from './core/batcher.js';
import { render } from './core/renderer.js';

// Inject the render function
globalBatcher.setHandler(render);
```

This decoupling prevents circular dependencies and makes the batcher testable in isolation.

## The Three Layers of Protection

1.  **Deduplication with `Set`**:
    
    -   The batcher maintains a `blocksToUpdate = new Set()`.
        
    -   Because a `Set` only stores unique values, if you trigger an update on the same block 50 times in a single loop, it is only added to the "todo" list **once**.
        
2.  **The `queued` Gatekeeper**:
    
    -   A boolean flag `queued` prevents multiple update cycles from being scheduled simultaneously.
        
    -   Once the first change hits the batcher, it "locks the gate," schedules the work, and ignores further requests to start a new cycle until the current one begins.
        
3.  **The `isProcessing` Lock**:
    
    -   This flag ensures that if a block's state changes _while_ the render is actually happening, it doesn't cause a collision or infinite loop.
        

## Timing: `requestAnimationFrame` (rAF)

Instead of updating immediately, LegoDOM uses `requestAnimationFrame`.

-   **What it does**: It tells the browser, "Wait until you are just about to draw the next frame on the screen, then run this code".

-   **Efficiency**: It bundles every single change from every block into a single "tick."
    
-   **The Benefit**: This syncs your JavaScript logic with the monitor's refresh rate (usually 60 times per second), making animations and updates look buttery smooth.
    

## The Execution Phase

When the "frame" triggers, the batcher:

1.  Takes a snapshot of the `Set`.
    
2.  Clears the `Set` for the next round.
    
3.  Runs `handler(el)` (which is `render(el)` from `src/core/renderer.js`) for every block in that batch.
    

## The `updated` Lifecycle Hook

After the render is complete, the batcher uses a `setTimeout(() => ..., 0)`.

-   **The Trick**: Even with a delay of `0`, this "macro-task" ensures the code inside runs **after** the browser has finished its rendering work.
    
-   **The Hook**: It looks for an `updated` lifecycle hook function in each block's state (`_studs`) and executes it. This is the perfect place to run code that needs to measure the new size of an element or scroll a list to the bottom.

**Example**

If you have a `chat-box` block and you update the messages, you might use the `updated()` hook to scroll to the bottom. Because of this batcher, you are guaranteed that the DOM has finished changing before your scroll logic runs.

## Integration with Reactivity

The batcher is called by the reactive proxy in `src/core/reactive.js`:

```js
// src/core/reactive.js
set: (t, k, v) => {
  const old = t[k];
  const r = Reflect.set(t, k, v);
  if (old !== v) batcher.add(el);
  return r;
}
```

Every state change triggers `batcher.add(el)`, which queues the element for rendering in the next frame.

> **Visualizing the flow:** State Change → `batcher.add(el)` → `Set` collects `el` → `rAF` triggers → `render(el)` runs → `updated()` hook fires.
