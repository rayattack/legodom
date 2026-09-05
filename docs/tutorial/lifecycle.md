# Lifecycle Hooks

Learn about block lifecycle hooks in Lego.

## Overview

Lego blocks have five lifecycle hooks:

- `mounted()` - Called after block is added to DOM
- `beforeUpdate()` - Called just before a re-render, with the old DOM intact
- `updated()` - Called right after a re-render commits
- `unmounted()` - Called when block is removed from DOM
- `errorCaptured(err, info)` - Called for an error raised by this block or any descendant

## mounted()

Called once when the block is first attached to the DOM.

### Usage

```js
{
  data: null,
  
  mounted() {
    console.log('Block is now in the DOM');
    this.fetchData();
  },
  
  async fetchData() {
    this.data = await fetch('/api/data').then(r => r.json());
  }
}
```

### Common Use Cases

**Fetch Data:**
```js
{
  mounted() {
    this.loadUserData();
  }
}
```

**Start Timers:**
```js
{
  timer: null,
  
  mounted() {
    this.timer = setInterval(() => {
      this.tick();
    }, 1000);
  }
}
```

**Add Event Listeners:**
```js
{
  mounted() {
    window.addEventListener('resize', this.handleResize.bind(this));
  }
}
```

**Initialize Third-Party Libraries:**
```js
{
  mounted() {
    this.chart = new Chart(this.$element.shadowRoot.querySelector('canvas'), {
      type: 'bar',
      data: this.chartData
    });
  }
}
```

### Async mounted() and `$loading`

If `mounted()` returns a promise, the runtime sets `$loading` on state for as long as it is pending, and clears it when the promise settles either way. Blocks with a synchronous `mounted()` never get the key at all, so a template can test for it directly.

```js
Lego.block('user-panel', {
  template: `
    <p b-if="$loading">Loading…</p>
    <p b-if="!$loading">[[ user.name ]]</p>
  `,
  logic: {
    user: {},
    async mounted() {
      this.user = await fetch('/api/me').then(r => r.json());
    }
  }
});
```

## beforeUpdate()

Called immediately before a batched re-render, on the block about to render. The DOM is still the one the last render produced, which is the point: it is the only place you can read a measurement that the incoming render is about to invalidate.

```js
{
  items: [],
  scrollFromBottom: 0,

  beforeUpdate() {
    // The list has not grown yet.
    const list = this.$element.shadowRoot.querySelector('.list');
    this.scrollFromBottom = list.scrollHeight - list.scrollTop;
  },

  updated() {
    // Now it has. Keep the viewport where the user left it.
    const list = this.$element.shadowRoot.querySelector('.list');
    list.scrollTop = list.scrollHeight - this.scrollFromBottom;
  }
}
```

It does **not** fire for the initial render, which is not an update.

## updated()

Called synchronously after each render flush commits, once per flush however many mutations went into it. The DOM is fully settled by then, including any child blocks the flush re-rendered, so this is the place to measure. It does **not** fire on initial mount, only on subsequent renders.

```js
list.state.items.push('new');
await Lego.nextTick();
// updated() has already run, and it saw the new row
```

### Usage

```js
{
  count: 0,
  
  updated() {
    console.log('Block re-rendered, count is:', this.count);
  }
}
```

### Common Use Cases

**Track Changes:**
```js
{
  previousValue: null,
  value: 0,
  
  updated() {
    if (this.value !== this.previousValue) {
      console.log('Value changed from', this.previousValue, 'to', this.value);
      this.previousValue = this.value;
    }
  }
}
```

**Update Third-Party Libraries:**
```js
{
  chartData: [],
  
  updated() {
    if (this.chart) {
      this.chart.data = this.chartData;
      this.chart.update();
    }
  }
}
```

**Analytics:**
```js
{
  updated() {
    if (window.gtag) {
      gtag('event', 'state_change', {
        block: 'my-block',
        count: this.count
      });
    }
  }
}
```

::: tip Once per flush, not once per write
Mutating ten keys in a row still produces one `updated()` call, because they all land in the same render flush. But it runs on the main thread, inside the frame, so don't put heavy work here. Move expensive work to a method called explicitly when something genuinely changes.
:::

## unmounted()

Called when the block is removed from the DOM.

### Usage

```js
{
  unmounted() {
    console.log('Block is being removed');
    this.cleanup();
  }
}
```

### Common Use Cases

**Clear Timers:**
```js
{
  timer: null,
  
  mounted() {
    this.timer = setInterval(() => this.tick(), 1000);
  },
  
  unmounted() {
    clearInterval(this.timer);
  }
}
```

**Remove Event Listeners:**
```js
{
  handleResize: null,
  
  mounted() {
    this.handleResize = () => {
      this.width = window.innerWidth;
    };
    window.addEventListener('resize', this.handleResize);
  },
  
  unmounted() {
    window.removeEventListener('resize', this.handleResize);
  }
}
```

**Destroy Third-Party Instances:**
```js
{
  chart: null,
  
  mounted() {
    this.chart = new Chart(...);
  },
  
  unmounted() {
    if (this.chart) {
      this.chart.destroy();
    }
  }
}
```

**Cancel Pending Requests:**
```js
{
  controller: null,
  
  async fetchData() {
    this.controller = new AbortController();
    try {
      const data = await fetch('/api/data', {
        signal: this.controller.signal
      }).then(r => r.json());
      this.data = data;
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('Fetch aborted');
      }
    }
  },
  
  unmounted() {
    if (this.controller) {
      this.controller.abort();
    }
  }
}
```

## errorCaptured()

Called when this block, or anything below it, raises an error: a render, a lifecycle hook, an event handler, a directive expression. The hook runs on the way out of the tree, innermost block first.

```js
{
  errorCaptured(err, info) {
    console.warn(`[${info.type}] in <${info.source.tagName.toLowerCase()}>`, err);
    // no return value: the error keeps travelling
  }
}
```

- `err` is the error.
- `info.type` is the context label: `'render'`, `'mounted'`, `'event-handler'`, and so on.
- `info.source` is the element the error came from.

**Return `false` to claim it.** No [error boundary](/tutorial/error-handling) renders and `Lego.config.onError` is not called. Return anything else, including nothing, and the error carries on to the next ancestor and then to the usual boundary handling. That makes `errorCaptured` useful two ways: as a reporting hook that watches without interfering, and as a surgical handler that swallows one kind of failure without replacing a whole subtree with a fallback block.

```js
{
  failed: false,

  errorCaptured(err, info) {
    if (info.type !== 'render') return;   // let anything else through
    this.failed = true;
    return false;                          // handled: no boundary, no onError
  }
}
```

An error thrown inside `errorCaptured` itself is reported through `Lego.config.onError` and goes no further, so a broken handler cannot recurse through the machinery it broke.

## Performance Hooks (Metrics)

For advanced monitoring, LegoDOM provides global hooks in `Lego.config.metrics`. These run for **every** block.

### `onRenderStart` & `onRenderEnd`

Useful for tracking how long renders take, which helps identify slow blocks.

```javascript
Lego.config.metrics = {
  onRenderStart(el) {
    console.time(`render-${el.tagName}`);
  },
  onRenderEnd(el) {
    console.timeEnd(`render-${el.tagName}`);
  }
};
```

## Lifecycle Flow

```
1. Block created (HTML element instantiated)
2. Shadow DOM attached (or, with shadow: false, the template renders in place)
3. Props applied: defaults, then :prop bindings, then plain attributes
4. Template rendered
5. mounted() hook called → Block is interactive ($loading set if it is async)
6. User interaction / state change
7. beforeUpdate() hook called → old DOM still in place
8. Block re-rendered
9. updated() hook called → DOM committed
10. (repeat steps 6-9 as needed)
11. Block removed from DOM
12. unmounted() hook called → Cleanup

errorCaptured() runs off to the side: any error raised anywhere in this flow,
in this block or below it, walks up through every errorCaptured on the way to
the error boundary.
```

## Complete Example

```js
{
  // State
  count: 0,
  timer: null,
  data: null,
  
  // Lifecycle: Block mounted
  mounted() {
    console.log('[mounted] Block added to DOM');
    
    // Fetch initial data
    this.fetchData();
    
    // Start interval
    this.timer = setInterval(() => {
      this.count++;
    }, 1000);
    
    // Add event listener
    this.handleKeyPress = (e) => {
      if (e.key === 'Escape') {
        this.reset();
      }
    };
    document.addEventListener('keydown', this.handleKeyPress);
  },
  
  // Lifecycle: Block updated
  updated() {
    console.log('[updated] Block re-rendered, count:', this.count);
    
    // Log when count reaches milestone
    if (this.count % 10 === 0) {
      console.log('Milestone:', this.count);
    }
  },
  
  // Lifecycle: Block unmounted
  unmounted() {
    console.log('[unmounted] Block removed from DOM');
    
    // Clear interval
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    // Remove event listener
    document.removeEventListener('keydown', this.handleKeyPress);
  },
  
  // Methods
  async fetchData() {
    this.data = await fetch('/api/data').then(r => r.json());
  },
  
  reset() {
    this.count = 0;
  }
}
```

## Best Practices

### 1. Initialize in mounted()

Don't fetch data or start timers in the state object:

```js
// ❌ Bad
{
  data: fetch('/api/data').then(r => r.json()),  // Executes immediately
  timer: setInterval(() => {}, 1000)  // Starts before block exists
}

// ✅ Good
{
  data: null,
  timer: null,
  mounted() {
    this.fetchData();
    this.timer = setInterval(() => {}, 1000);
  }
}
```

### 2. Always Clean Up

If you start something in `mounted()`, stop it in `unmounted()`:

```js
{
  mounted() {
    this.timer = setInterval(...);
    window.addEventListener('resize', this.handleResize);
  },
  
  unmounted() {
    clearInterval(this.timer);  // ✅
    window.removeEventListener('resize', this.handleResize);  // ✅
  }
}
```

### 3. Keep updated() Light

`updated()` runs once per flush, not once per write, but it runs on the main thread inside the frame. Don't lock it up:

```js
// ❌ Bad
{
  updated() {
    this.expensiveCalculation();  // Runs every cycle, even when irrelevant data changes
  }
}

// ✅ Good, call expensive work explicitly when its inputs actually change
{
  count: 0,
  set count(v) {
    if (this._count !== v) {
      this._count = v;
      this.recompute();
    }
  }
}
```

### 4. Guard Against Errors

```js
{
  unmounted() {
    // Check before clearing
    if (this.timer) {
      clearInterval(this.timer);
    }
    
    // Check before destroying
    if (this.chart) {
      this.chart.destroy();
    }
  }
}
```

## Common Patterns

### Loading State

```js
{
  loading: true,
  data: null,
  
  async mounted() {
    try {
      this.data = await fetch('/api/data').then(r => r.json());
    } finally {
      this.loading = false;
    }
  }
}
```

### Polling

```js
{
  pollInterval: null,
  
  mounted() {
    this.poll();
    this.pollInterval = setInterval(() => this.poll(), 5000);
  },
  
  async poll() {
    this.data = await fetch('/api/status').then(r => r.json());
  },
  
  unmounted() {
    clearInterval(this.pollInterval);
  }
}
```

### Scroll Position

```js
{
  scrollY: 0,
  handleScroll: null,
  
  mounted() {
    this.handleScroll = () => {
      this.scrollY = window.scrollY;
    };
    window.addEventListener('scroll', this.handleScroll);
  },
  
  unmounted() {
    window.removeEventListener('scroll', this.handleScroll);
  }
}
```

### Animation

```js
{
  mounted() {
    const el = this.$element.shadowRoot.querySelector('.animated');
    el.classList.add('fade-in');
  }
}
```

## Debugging Lifecycle

Log lifecycle events to understand block behavior:

```js
{
  mounted() {
    console.log('[LIFECYCLE] mounted');
  },
  
  updated() {
    console.log('[LIFECYCLE] updated');
  },
  
  unmounted() {
    console.log('[LIFECYCLE] unmounted');
  }
}
```

## Next Steps

- See [lifecycle examples](/examples/)
- Learn about [block patterns](/tutorial/blocks)
- Explore [state management](/tutorial/reactivity)
