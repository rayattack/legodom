# Templating

Learn about Lego templating features and syntax.

## Interpolation

Use `{{ }}` to insert dynamic content:

### Simple Values

```html
<p>{{ message }}</p>
<h1>{{ title }}</h1>
<span>{{ count }}</span>
```

### Expressions

```html
<p>{{ count * 2 }}</p>
<span>{{ price.toFixed(2) }}</span>
<div>{{ firstName + ' ' + lastName }}</div>
```

### Method Calls

```html
<p>{{ formatDate(timestamp) }}</p>
<span>{{ calculateTotal() }}</span>
<div>{{ getUsername() }}</div>
```

### Conditional (Ternary)

```html
<p>{{ age >= 18 ? 'Adult' : 'Minor' }}</p>
<span>{{ isOnline ? '🟢 Online' : '🔴 Offline' }}</span>
<div>{{ items.length > 0 ? items.length + ' items' : 'Empty' }}</div>
```

## Attribute Binding

Interpolate in any attribute:

### Simple Attributes

```html
<img src="/avatars/{{ userId }}.png" alt="{{ username }}">
<a href="/user/{{ userId }}">{{ username }}</a>
<input placeholder="{{ defaultText }}">
```

### Class Names

```html
<div class="card {{ isActive ? 'active' : '' }}">...</div>
<button class="{{ isDisabled ? 'disabled' : 'enabled' }}">...</button>
<li class="item status-{{ status }}">...</li>
```

### Data Attributes

```html
<div data-id="{{ itemId }}" data-type="{{ itemType }}">...</div>
```

### Style (Inline)

```html
<div style="color: {{ textColor }}; background: {{ bgColor }}">...</div>
```

## Escaping

Lego automatically escapes HTML to prevent XSS:

```js
{
  userInput: '<script>alert("XSS")</script>'
}
```

```html
<p>{{ userInput }}</p>
<!-- Renders as: &lt;script&gt;alert("XSS")&lt;/script&gt; -->
```

**There is no way to render raw HTML.** This is by design—for security.

## Whitespace

Templates preserve whitespace:

```html
<p>
  {{ message }}
</p>
<!-- Renders with newlines and indentation -->
```

Trim manually if needed:

```html
<p>{{ message.trim() }}</p>
```

## Context

Inside `{{ }}`, you have access to:

### Component State (`this`)

```html
<p>{{ count }}</p>  <!-- this.count -->
<span>{{ user.name }}</span>  <!-- this.user.name -->
```

### Methods

```html
<p>{{ formatDate(timestamp) }}</p>
<div>{{ calculateTotal() }}</div>
```

### Special Keywords

- `global` - Access `Lego.globals`
- `event` - In event handlers
- `self` - Reference to component element (rare)

```html
<p>{{ global.user.name }}</p>
<button @click="console.log(event)">Click</button>
```

## Complex Examples

### Formatting Currency

```js
{
  price: 29.99,
  formatCurrency(value) {
    return '$' + value.toFixed(2);
  }
}
```

```html
<p>Price: {{ formatCurrency(price) }}</p>
```

### Date Formatting

```js
{
  timestamp: Date.now(),
  formatDate(ts) {
    return new Date(ts).toLocaleDateString();
  }
}
```

```html
<time>{{ formatDate(timestamp) }}</time>
```

### Pluralization

```js
{
  items: ['apple', 'banana'],
  plural(count, singular, plural) {
    return count === 1 ? singular : plural;
  }
}
```

```html
<p>{{ items.length }} {{ plural(items.length, 'item', 'items') }}</p>
```

### Truncation

```js
{
  description: 'Very long text...',
  truncate(text, length) {
    return text.length > length 
      ? text.slice(0, length) + '...' 
      : text;
  }
}
```

```html
<p>{{ truncate(description, 100) }}</p>
```

## Limitations

### No Statements

Can't use statements—only expressions:

```html
<!-- ❌ Doesn't work -->
<p>{{ if (condition) { return 'yes'; } }}</p>
<p>{{ for (let i = 0; i < 10; i++) { } }}</p>

<!-- ✅ Use ternary or methods -->
<p>{{ condition ? 'yes' : 'no' }}</p>
<p>{{ renderList() }}</p>
```

### No Declarations

Can't declare variables:

```html
<!-- ❌ Doesn't work -->
<p>{{ const total = price * qty; total }}</p>

<!-- ✅ Use methods -->
<p>{{ getTotal() }}</p>
```

```js
{
  getTotal() {
    const total = this.price * this.qty;
    return total;
  }
}
```

## Best Practices

### 1. Keep Templates Simple

If logic is complex, use methods:

```html
<!-- ❌ Too complex -->
<p>{{ items.filter(x => x.active).map(x => x.name).join(', ') }}</p>

<!-- ✅ Better -->
<p>{{ getActiveNames() }}</p>
```

```js
{
  getActiveNames() {
    return this.items
      .filter(x => x.active)
      .map(x => x.name)
      .join(', ');
  }
}
```

### 2. Format in Methods

Don't put formatting logic in templates:

```html
<!-- ❌ Messy -->
<p>${{ (price * 1.2).toFixed(2) }}</p>

<!-- ✅ Clean -->
<p>{{ formatPrice(price) }}</p>
```

### 3. Avoid Side Effects

Don't mutate state in templates:

```html
<!-- ❌ Bad -->
<p>{{ count++ }}</p>

<!-- ✅ Good -->
<p>{{ count }}</p>
<button @click="count++">Increment</button>
```

### 4. Use Descriptive Method Names

```js
{
  // ✅ Clear purpose
  formatCurrency(value) { ... },
  calculateTax(amount) { ... },
  isValidEmail(email) { ... }
}
```

## Performance Tips

### Cache Computed Values

If a calculation is expensive, cache it:

```js
{
  items: [],
  _cachedTotal: null,
  
  total() {
    if (this._cachedTotal === null) {
      this._cachedTotal = this.items.reduce((sum, x) => sum + x.price, 0);
    }
    return this._cachedTotal;
  },
  
  updated() {
    this._cachedTotal = null;  // Invalidate cache
  }
}
```

### Avoid Heavy Calculations

```html
<!-- ❌ Runs on every render -->
<p>{{ expensiveCalculation() }}</p>

<!-- ✅ Calculate once, store result -->
<p>{{ cachedResult }}</p>
```

```js
{
  cachedResult: null,
  mounted() {
    this.cachedResult = this.expensiveCalculation();
  }
}
```

## Common Patterns

### Show/Hide Based on Condition

```html
<p b-if="user">Welcome, {{ user.name }}!</p>
<p b-if="!user">Please log in</p>
```

### List with Index

```html
<ul>
  <li b-for="item in items">
    #{{ $index + 1 }}: {{ item.name }}
  </li>
</ul>
```

### Conditional Classes

```html
<div class="item {{ item.active ? 'active' : '' }} {{ item.featured ? 'featured' : '' }}">
  {{ item.name }}
</div>
```

### Dynamic Attributes

```html
<a 
  href="/product/{{ product.id }}" 
  class="product-link {{ product.inStock ? '' : 'out-of-stock' }}"
  title="{{ product.name }} - ${{ product.price }}">
  {{ product.name }}
</a>
```

## Next Steps

- Learn about [Directives](/guide/directives)
- See [templating examples](/examples/)
- Explore [component patterns](/guide/components)
