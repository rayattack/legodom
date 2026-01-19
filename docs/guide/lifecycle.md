# Lifecycle Hooks

Learn about block lifecycle hooks in Lego.

## Overview

Lego blocks have three lifecycle hooks:

- `mounted()` - Called after block is added to DOM
- `updated()` - Called after state changes and re-render
- `unmounted()` - Called when block is removed from DOM

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

## updated()

Called after every state change and re-render.

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

::: warning Performance
`updated()` runs on every state change. Keep it lightweight!
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
  }
}
```

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

### `onAllSettled` (New in v2.0)

Called when the entire block tree (including Shadow DOM children) has finished its initial render pass. This is perfect for removing loading spinners or measuring "Time to Interactive".

```javascript
/* main.js */
Lego.init(document.body).then(() => {
  document.getElementById('global-loader').remove();
});
```

## Lifecycle Flow

```
1. Block created (HTML element instantiated)
2. Shadow DOM attached
3. Template rendered
4. mounted() hook called → Block is interactive
5. User interaction / state change
6. Block re-rendered
7. updated() hook called
8. (repeat steps 5-7 as needed)
9. Block removed from DOM
10. unmounted() hook called → Cleanup
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

`updated()` runs frequently—avoid heavy operations:

```js
// ❌ Bad
{
  updated() {
    this.expensiveCalculation();  // Runs on every change!
  }
}

// ✅ Good
{
  updated() {
    // Only log or track
    console.log('State changed');
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
- Learn about [block patterns](/guide/blocks)
- Explore [state management](/guide/reactivity)
