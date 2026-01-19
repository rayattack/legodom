# Lifecycle Hooks

Components in LegoDOM have a simple lifecycle managed by the `snap` (mount) and `unsnap` (unmount) mechanism.

## mounted()

Called immediately after the component is connected to the DOM and its template has been rendered. This is the place to fetch data or set up subscriptions.

```js
{
  mounted() {
    console.log("Component mounted!", this.$element);
    this.fetchData();
  }
}
```

## unmounted()

Called when the component is removed from the DOM (unsnapped). Use this to clean up timers or event listeners that were not attached via `b-*` directives.

```js
{
  unmounted() {
    // Cleanup 
    clearInterval(this.timer);
  }
}
```

## updated()

Called after the component's state changes and the DOM has been updated. LegoDOM batches updates, so this will only run once per render cycle even if multiple state properties change.

```js
{
  updated() {
    console.log("Component re-rendered");
  }
}
```
