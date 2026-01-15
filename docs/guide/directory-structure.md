# Chaos Tends To A Minimum

> [!NOTE] This is a Recommendation, Not a Bible
> This page is one person's take on how to structure large LegoDOM applications. It is not enforced by the framework. You are encouraged to adapt, improve, or completely ignore it. If you find a better pattern, please share it.

---

In LegoDOM land everything is a `.lego`. A `block` is a lego, a `widget` is a lego, a `component` is a lego, a `page` is a lego.

But what do they *mean*?


## The Four Levels

| Level | Role | Knows About | Example |
| :--- | :--- | :--- | :--- |
| **Block** | Identity | Its own visuals | `<block-avatar>`, `<block-button>` |
| **Widget** | Intent | How an interaction works | `<widget-file-trigger>`, `<widget-dropdown>` |
| **Component** | Computation | Business data & API calls | `<comp-profile-settings>`, `<comp-checkout-form>` |
| **Page** | Coordination | Layout & Routing | `<page-dashboard>`, `<page-login>` |


## The Litmus Test: The Avatar Upload

**The Question:**
> I have an avatar. When I click it, it opens a file picker. When the file changes, it POSTs to `/v1/avatars`. What is it? A Block? A Widget? A Component?

**The Technical Answer:** `main.js` allows all of this in one file. It will work.

**The Architectural Answer:** You have conflated three distinct responsibilities into one:
1.  **Identity** Looking like an avatar.
2.  **Intent** Picking a file.
3.  **Computation** Saving to *your specific server*.

**The Consequence:**
If you later want to display that avatar in a read-only user list, you *cannot reuse this component* because clicking it triggers unwanted upload logic. You will be forced to create a new, duplicate `<block-avatar>` just for display.

### The "Lego Way" Solution

Split this into its three atomic truths to maximize reusability.

#### 1. The Block (Identity)

```html
<!-- block-avatar.lego -->
<template>
  <img class="avatar" src="[[ src ]]" alt="[[ alt ]]">
</template>

<style>
  .avatar { width: 48px; height: 48px; border-radius: 50%; object-fit: cover; }
</style>

<script>
export default {
  src: '/default-avatar.png',
  alt: 'User'
}
</script>
```
-   **Role:** Just the visuals. Circular crop, fallback, size classes.
-   **Logic:** None. Zero business knowledge.
-   **Reusability:** Used *everywhere* e.g. Navbar, User List, Profile Page, Comments.

#### 2. The Widget (Intent)

```html
<!-- widget-file-trigger.lego -->
<template>
  <div @click="openPicker()">
    <slot></slot>
    <input type="file" style="display:none" b-var="avatarFileElement" @change="onFileChange">
  </div>
</template>

<script>
export default {
  openPicker() {
    this.$vars.avatarFileElement.click();
  },
  onFileChange(event) {
    // It doesn't know about /v1/avatars. It just hands you the file.
    this.$emit('file-selected', { file: event.target.files[0] });
  }
}
</script>
```
-   **Role:** The mechanic. Wraps any slotted content and makes it clickable to open a file dialog.
-   **Logic:** Handles the hidden `<input type="file">`, listens for `change`, and **emits an event**.
-   **Boundary:** It uses `$emit` (from `main.js`) to broadcast what happened. It never makes API calls.

#### 3. The Component (Computation a.k.a. Context)

```html
<!-- comp-profile-settings.lego -->
<template>
  <h2>Your Profile</h2>
  <widget-file-trigger @file-selected="uploadAvatar">
    <block-avatar src="[[ user.avatarUrl ]]"></block-avatar>
  </widget-file-trigger>
  <p>Click avatar to change</p>
</template>

<script>
export default {
  user: { avatarUrl: '/me.jpg' },

  async uploadAvatar(event) {
    const file = event.detail.file;
    // BUSINESS LOGIC LIVES HERE
    const formData = new FormData();
    formData.append('avatar', file);
    const res = await fetch('/v1/avatars', { method: 'POST', body: formData });
    const data = await res.json();
    this.user.avatarUrl = data.url; // Reactivity updates the block-avatar
  }
}
</script>
```
-   **Role:** The boss. Assembles the parts and owns the API call.
-   **Logic:** Knows about `user`, knows about `/v1/avatars`, handles the business outcome.
-   **Boundary:** This is the *only* place that knows about your specific backend.

---

## The Definitions

### Blocks (Atoms)

> **TL;DR** A Block is an irreducible thing. A UI with identity, but no narrative intent.

A Block cannot be broken down into smaller Blocks. It is self-contained.

-   **State:** Visual only. It can track "Is my mouse over me?" or "Am I spinning?". It never knows about User IDs, Auth tokens, or business data.
-   **Naming:** `block-avatar`, `block-button`, `block-spinner`, `block-card`.
-   **Rule:** If you find yourself nesting Blocks inside other Blocks, you have graduated to a Widget.

> [!WARNING] Don't Confuse Styling with Blocks
> You can use CSS to style many `<h1>` elements. That doesn't mean you need a `<block-title-header>`. Only create a Block when it has distinct *behavior* or *identity* beyond mere styling.


### Widgets (Molecules)

> **TL;DR** A Widget is an interaction, not a thing.

A Widget gives Blocks a reason to exist together. It defines *how* an interaction works without embedding *who* it's for or *what* business outcome it serves.

-   **State:** Internal UI state only. "Is the dropdown open?" "Which tab is active?"
-   **Naming:** `widget-dropdown`, `widget-modal`, `widget-datepicker`, `widget-file-trigger`.
-   **Rule:** Widgets are portable. You should be able to copy a Widget to a completely different project and it should still work.
-   **Communication:** Uses `$emit()` to broadcast events. Never makes API calls itself.


### Components (Organisms)

> **TL;DR** Components are where your app features come to life.

A Component is a Widget (or set of Widgets) bound to specific data, rules, and responsibility. It's where interaction becomes meaningful to *this* application.

-   **State:** Domain-specific. Owns data fetched from APIs. Knows about the current user.
-   **Naming:** `comp-profile-settings`, `comp-order-history`, `comp-payroll-table`.
-   **Rule:** A Component knows *who* it is for, *what* data it owns, and *what* outcome it must produce.
-   **Communication:** Listens to Widget events (like `@file-selected`) and performs business transactions.


### Pages (Coordination)

> **TL;DR** A Page is the top-level host that routing targets.

Pages are the uppermost hosts. They orchestrate the layout of Components within the context of a LegoDOM application.

-   **Role:** Define the grid. Orchestrate Components. Handle route parameters.
-   **Naming:** `page-dashboard`, `page-login`, `page-user-profile`.
-   **Rule:** Pages are the *only* UI units directly known to `<lego-router>`. While a Component owns the *logic* of a feature, a Page owns the *real estate*.

---

## Recommended Directory Structure

```text
src/
├── blocks/           # Design System primitives
│   ├── block-avatar.lego
│   ├── block-button.lego
│   └── block-input.lego
├── widgets/          # Generic, portable UI tools
│   ├── widget-dropdown.lego
│   ├── widget-modal.lego
│   └── widget-file-trigger.lego
├── components/       # Domain-specific features
│   ├── comp-profile-settings.lego
│   └── comp-order-history.lego
├── pages/            # Route targets
│   ├── page-dashboard.lego
│   └── page-login.lego
└── main.js           # App entry, routes, globals
```

---

## Summary

| If you keep it all in one file... | The "Enterprise" Standard |
| :--- | :--- |
| Name it `<comp-avatar-upload>` and accept it is not reusable. | Let the **Widget** handle the interaction. Let the **Component** handle the transaction. |

**This is a recommendation.** If you find a pattern that works better for your team, use it. The goal is clarity, reusability, and reducing arguments - not rigid adherence to a doctrine.
