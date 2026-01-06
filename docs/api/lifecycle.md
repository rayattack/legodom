# Lifecycle Hooks

Methods that are automatically called during a component's lifecycle.

## init()

Called when the component is initialized and state is reactive, but before rendering.

```js
{
  init() {
    this.fetchData();
  }
}
```

## render()

Called after the DOM has been updated.

```js
{
  render() {
    console.log('Component rendered');
  }
}
```

## destroy()

Called when the component is removed from the DOM.

```js
{
  destroy() {
    // Cleanup timers or listeners
    clearInterval(this.timer);
  }
}
```
