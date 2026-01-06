# Global Helpers

Lego exposes a global `Lego` object when loaded via CDN, or as exports when using modules.

## Lego.page

Access to the router's current state.

```js
console.log(Lego.page.params); // URL parameters
console.log(Lego.page.query);  // Query string parameters
```

## Lego.create()

Manually create a reactive object (stud) detached from a component.

```js
const store = Lego.create({ count: 0 });
```

## Event Bus

Simple global event bus.

```js
Lego.on('user-login', (user) => { ... });
Lego.emit('user-login', { name: 'Alice' });
```
