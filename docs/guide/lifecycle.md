# Lifecycle Hooks

Learn about component lifecycle hooks in Lego.

## Overview

Components have three lifecycle hooks:

- `mounted()` - Called after component is added to DOM
- `updated()` - Called after state changes and re-render
- `unmounted()` - Called when component is removed from DOM

## mounted()

Called once when the component is first attached to the DOM.

### Usage

```js
{
  data: null,
  
  mounted() {
    console.log('Component is now in the DOM');
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
    console.log('Component re-rendered, count is:', this.count);
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
        component: 'my-component',
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

Called when the component is removed from the DOM.

### Usage

```js
{
  unmounted() {
    console.log('Component is being removed');
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

## Lifecycle Flow

```
1. Component created (HTML element instantiated)
2. Shadow DOM attached
3. Template rendered
4. mounted() hook called → Component is interactive
5. User interaction / state change
6. Component re-rendered
7. updated() hook called
8. (repeat steps 5-7 as needed)
9. Component removed from DOM
10. unmounted() hook called → Cleanup
```

## Complete Example

```js
{
  // State
  count: 0,
  timer: null,
  data: null,
  
  // Lifecycle: Component mounted
  mounted() {
    console.log('[mounted] Component added to DOM');
    
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
  
  // Lifecycle: Component updated
  updated() {
    console.log('[updated] Component re-rendered, count:', this.count);
    
    // Log when count reaches milestone
    if (this.count % 10 === 0) {
      console.log('Milestone:', this.count);
    }
  },
  
  // Lifecycle: Component unmounted
  unmounted() {
    console.log('[unmounted] Component removed from DOM');
    
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
  timer: setInterval(() => {}, 1000)  // Starts before component exists
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

Log lifecycle events to understand component behavior:

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
- Learn about [component patterns](/guide/components)
- Explore [state management](/guide/reactivity)
