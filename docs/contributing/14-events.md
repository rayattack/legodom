# Lights, Camera, Action

This is how LegoDOM makes your components interactive by connecting DOM events (clicks, keypresses, submits) directly to the methods you wrote in
your **SFC** (Single File Component) autodiscovered **.lego** file, `<template />` tag or Lego.define call.

## Event Handling (The `@event` Syntax)

LegoDOM uses a shorthand syntax for event listeners: `@event-name="methodName"`. For example, `@click="increment"` or `@submit="saveUser"`.

### 1. The `bind(container, el)` Phase

During the `snap()` process, after the Shadow DOM is attached, LegoDOM calls `bind(container, el)`.

-   **Scanning for Attributes**: It looks through all elements in the Shadow DOM for any attribute starting with `@`.
    
-   **The Match**: If it finds `@click="toggle"`, it identifies `click` as the event and `toggle` as the function name to look for in `_studs`.
    

### 2. Context Preservation (`.bind`)

This is a critical "under the hood" step. When you click a button, the browser usually sets the keyword `this` to the button itself. However, in Lego, you want `this` to be your **reactive state**.

-   **The Implementation**:
    
    ```js
    const handler = state[methodName].bind(state);
    node.addEventListener(eventName, handler);
    ```
    
-   By using `.bind(state)`, LegoDOM ensures that when your `toggle()` function runs, `this.show = true` actually updates the proxy state, not the HTML button.
    

### 3. Argument Support

LegoDOM is flexible with how you call these methods:

-   **Standard Call**: `@click="doSomething"` passes the native `Event` object as the first argument.
    
-   **Parameterized Call**: `@click="deleteItem(5)"`. LegoDOM uses a regex to check if there are parentheses. If it finds them, it parses the arguments (like `5`) and passes them to your function.
    
-   **The "Native" `event`**: If you write `@click="move(event, 10)"`, LegoDOM injects the native browser event object into that specific slot. (Note: use `event`, not `$event`).
    

### 4. Event Modifiers

Lego includes built-in modifiers to handle common web patterns without writing extra JS:

-   **`.prevent`**: Automatically calls `event.preventDefault()`. Great for `@submit.prevent="save"`.
    
-   **`.stop`**: Calls `event.stopPropagation()` to stop the event from bubbling up to parent elements.
    
-   **`.enter`**: Only triggers the method if the "Enter" key was pressed (perfect for search bars).
    

----------

**Summary**: The `@` syntax automates `addEventListener`, ensures the correct `this` context for your methods, and provides powerful modifiers to keep your component logic clean.
