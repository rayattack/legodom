# Surgical Swaps: Mastering b-target

The true power of LegoDOM lies in its ability to perform **Surgical Swaps**. In a traditional application, clicking a link often causes the entire page to re-render, destroying the state of your sidebar, header, or scroll position.

With `b-target` (and optionally `b-link`), we can choose to update only a specific "fragment" of the page.

## The Problem with "Nuclear" Navigation

Imagine a messaging app (like LinkedIn or Slack). You have a sidebar full of conversations. When you click a message, you want the chat window to update, but you **don't** want the sidebar to reload.

If the sidebar reloads:

1.  The scroll position is lost.
    
2.  Any search text in the sidebar is cleared.
    
3.  The UI "flickers," making the app feel slow.


## The Solution: `b-target`

The `b-target` directive allows a link to specify exactly where the new component should be rendered. It implies `b-link` (history update) by default.


### Example: messaging-shell.html

In this SFC, we define a layout with a sidebar and a main content area. Clicking a contact updates _only_ the `<main>` area.

```html
<!-- messaging-shell.html -->
<template>
  <div class="messaging-layout">
    <aside class="sidebar">
      <h2>Contacts</h2>
      <nav>
        <a href="/chat/alice" b-target="#chat-window">Alice</a>
        <a href="/chat/bob" b-target="#chat-window">Bob</a>
      </nav>
    </aside>

    <main id="chat-window">
      <p>Select a contact to start chatting.</p>
    </main>
  </div>
</template>

<script>
  export default {
    mounted() {
      console.log("Messaging shell ready.");
    }
  }
</script>

<style>
  .messaging-layout {
    display: flex;
    height: 100vh;
  }
  .sidebar {
    width: 300px;
    border-right: 1px solid #ccc;
  }
  #chat-window {
    flex: 1;
    padding: 20px;
  }
</style>

```

### 1. Targeting by ID

You can tell Lego to find a specific element by its ID and replace its contents.

```html
<!-- messaging-shell.html -->
<template>
  <div class="layout">
    <aside class="sidebar">
      <div b-for="chat in threads">
        <!-- Parent component (this shell) binds data to these links -->
        <a href="/messaging/{{chat.id}}" b-target="#chat-window">
          {{chat.userName}}
        </a>
      </div>
    </aside>

    <main id="chat-window">
      <!-- Only this area will change when a link is clicked -->
      <p>Select a conversation to begin.</p>
    </main>
  </div>
</template>

```

### 2. Targeting by Component Tag (The Web Component Way)

Because Lego is built on Custom Elements, you can target a component tag directly. The framework will find that tag and swap its internal content.

```html
<a href="/profile/settings" b-target="settings-view">Edit Settings</a>

<settings-view>
  <!-- Content gets swapped here -->
</settings-view>

```

## How the Target Resolver Works

When you click a link with a `b-target`, the LegoDOM **Target Resolver** follows a specific hierarchy:

1.  **Local Scope**: It looks for the target inside the current component first. This prevents "ID collisions" if you have multiple instances of a layout.
    
2.  **Component Match**: If the target doesn't start with `#`, it treats it as a tag name (e.g., `thread-view`).
    
3.  **Global Fallback**: If it can't find a local match, it searches the entire document.
    
4.  **Router Fallback**: If no target is found, it defaults back to the `<lego-router>`.
    

## Smart History

Even though we are only swapping a small part of the DOM, LegoDOM is smart enough to update the browser's address bar.

When a surgical swap happens, Lego saves the "target" information into the browser's history state (`history.state.legoTargets`). This means that when a user hits the **Back Button**, Lego knows exactly which fragment needs to be swapped back to its previous state.

## Summary

`b-target` turns your web app into a high-performance workspace. By keeping the "Shell" alive and only swapping "Fragments," you maintain state, eliminate flickers, and provide a desktop-like experience.

Next, we will tackle the most common question: **"What happens if I refresh the page while looking at a surgical fragment?"** We'll explore the **Cold Start: Self-Healing Layouts**.
