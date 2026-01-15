# Architectural Deep Dive

Welcome to the internal documentation of LegoDOM.

This isn't a "how to use" guide. This is a **"how it works"** guide. I believe that understanding the soul of LegoDOM should/could make you a better contributor.

## The Philosophy
**"The Platform is the Runtime."**
We avoid compilers, transpilers, and VDOMs. We use:
- **Proxies** for state.
- **TreeWalkers** for scanning.
- **Regex** for parsing.
- **MutationObservers** for efficiency.

## The Journey
Follow the path of a component from HTML string to Pixel:

1.  [**Init**](./06-init) - How the library wakes up.
2.  [**Scanner**](./11-scanner) - How we find holes in your HTML (Regex vs AST).
3.  [**Studs**](./10-studs) - The Reactivity Engine (Proxies).
4.  [**Render**](./12-render) - The "Loop of Truth" & Security.
5.  [**Router**](./15-router) - The "Surgical" Update philosophy.

Dive in.
