---
layout: lesson
title: Lifecycle hooks
---

# Lifecycle hooks

A block can run code at set moments of its life by defining methods with reserved names.

| Hook | Runs |
|---|---|
| `mounted()` | once, after the block is on the page |
| `updated()` | after each render that changed something |
| `unmounted()` | once, when the block is removed |

`mounted` is where timers, subscriptions and fetches start. Anything you start by hand, you stop in `unmounted`. Listeners added with `@event` and watchers made with `$watch` are cleaned up for you.

## Your turn

`tick-clock.lego` should count seconds while it is on screen.

1. In `mounted()`, start a `setInterval` that adds one to `seconds` every second. Keep the id on `this.timer`.
2. In `unmounted()`, call `clearInterval(this.timer)`.
3. Toggle the clock off and on with the button.

Each time it comes back it starts from zero, because `b-if` creates a new instance. The **Console** tab shows the hooks firing.
