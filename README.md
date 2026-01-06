# Lego 🧱

**The tiny, zero-dependency library for building reactive Web Components.**

Lego embraces the web platform. It turns standard HTML `<template>` tags into reactive, encapsulated custom elements with zero build steps required.

[**Explore the Docs**](https://rayattack.github.io/legodom/) | [**Examples**](https://rayattack.github.io/legodom/examples/) | [**GitHub**](https://github.com/rayattack/legodom)

---

## Why Lego?

- ⚡ **Extremely Fast** – No virtual DOM. No reconciliation. Direct DOM updates.
- 📦 **Zero Dependencies** – Weighs less than 4kb gzipped.
- 🛠️ **No Build Step** – Works directly in the browser with standard `<script>` tags.
- 🧩 **Native Web Components** – Real Custom Elements, real Shadow DOM.
- 📝 **Familiar Mentals** – Plain JavaScript objects for state, plain HTML for templates.

---

## Quick Start (No Build Required)

```html
<!DOCTYPE html>
<html>
<body>
  <hello-world></hello-world>

  <template b-id="hello-world">
    <style>
      h1 { color: #ffca28; font-family: sans-serif; }
    </style>
    <h1>Hello, {{ name }}!</h1>
    <button @click="toggle()">Toggle Name</button>
  </template>

  <script src="https://unpkg.com/lego-dom/main.js"></script>
  <script>
    document.querySelector('hello-world').state = {
      name: 'World',
      toggle() {
        this.name = this.name === 'World' ? 'Lego' : 'World';
      }
    };
  </script>
</body>
</html>
```

---

## Also Supports Modern Toolchains

Lego includes a **Vite plugin** for developers who prefer **Single File Components (.lego)**:

```html
<!-- user-card.lego -->
<template>
  <h1>{{ name }}</h1>
</template>

<style>
  self { display: block; padding: 20px; }
</style>

<script>
  export default { name: 'John Doe' }
</script>
```

---

## 🔗 Links

- 📖 [Full Documentation](https://rayattack.github.io/legodom/)
- 🚀 [Quick Start Guide](https://rayattack.github.io/legodom/guide/quick-start)
- 🔌 [Vite Plugin Setup](https://rayattack.github.io/legodom/api/vite-plugin)
- 🧪 [Example Showcase](https://rayattack.github.io/legodom/examples/)

## License

MIT © [Tersoo Ortserga](https://github.com/rayattack)
