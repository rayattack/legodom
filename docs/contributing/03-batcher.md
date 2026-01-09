# Batching, Scheduling, and doing things the right way

Say you are building the next big thing, if you update checkboxes, input fields a 100 times,
you don't want the DOM to re-render 100 times. That would be a performance nightmare.
LegoDOM uses Batching & Scheduling to do things the right way.


## Topic 3: The Global Batcher & Scheduler

When you change data in a reactive application, you often change multiple things at once (e.g., updating a user's name, age, and profile picture). Without a **Batcher**, the browser would try to re-render the HTML every single time one of those properties changed. This would cause "jank" (stuttering) and poor performance.

### The `createBatcher` Factory

The library defines `createBatcher` as a closure that manages the update cycle. It provides three critical layers of protection:

```js
  const createBatcher = () => {
    let queued = false;
    const componentsToUpdate = new Set();
    let isProcessing = false;

    return {
      add: (el) => {
        if (!el || isProcessing) return;
        componentsToUpdate.add(el);
        if (queued) return;
        queued = true;

        requestAnimationFrame(() => {
          isProcessing = true;
          const batch = Array.from(componentsToUpdate);
          componentsToUpdate.clear();
          queued = false;

          batch.forEach(el => render(el));

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

  const globalBatcher = createBatcher();
```

1.  **Deduplication with `Set`**:
    
    -   The batcher maintains a `componentsToUpdate = new Set()`.
        
    -   Because a `Set` only stores unique values, if you trigger an update on the same component 50 times in a single loop, it is only added to the "todo" list **once**.
        
2.  **The `queued` Gatekeeper**:
    
    -   A boolean flag `queued` prevents multiple update cycles from being scheduled simultaneously.
        
    -   Once the first change hits the batcher, it "locks the gate," schedules the work, and ignores further requests to start a new cycle until the current one begins.
        
3.  **The `isProcessing` Lock**:
    
    -   This flag ensures that if a component’s state changes _while_ the render is actually happening, it doesn't cause a collision or infinite loop.
        

### Timing: `requestAnimationFrame` (rAF)

Instead of updating immediately, the library uses `requestAnimationFrame`.

-   **What it does**: It tells the browser, "Wait until you are just about to draw the next frame on the screen, then run this code".

-   **Efficiency**: It bundles every single change from every component into a single "tick."
    
-   **The Benefit**: This syncs your JavaScript logic with the monitor's refresh rate (usually 60 times per second), making animations and updates look buttery smooth.
    

### The Execution Phase

When the "frame" triggers, the batcher:

1.  Takes a snapshot of the `Set`.
    
2.  Clears the `Set` for the next round.
    
3.  Runs `render(el)` for every component in that batch.
    

### The `updated` Lifecycle Hook

After the render is complete, the batcher uses a `setTimeout(() => ..., 0)`.

-   **The Trick**: Even with a delay of `0`, this "macro-task" ensures the code inside runs **after** the browser has finished its rendering work.
    
-   **The Hook**: It looks for `our` lifecycle hook function a.k.a or notoriously known as `updated`
in each component's state (`_studs`) and executes it. This is the perfect place for us to run code that needs to measure the new size of an element or scroll a list to the bottom.

**Example**
If you have a `chat-box` component and you update the messages, you might use the `updated()` hook to scroll to the bottom. Because of this batcher, you are guaranteed that the DOM has finished changing before your scroll logic runs.


> **Visualizing the flow:** State Change -> `batcher.add(el)` -> `Set` collects `el` -> `rAF` triggers -> `render(el)` runs -> `updated()` hook fires.
