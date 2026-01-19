# Everything is a Block

> [!NOTE] This is a Recommendation, Not a Rule
> This page is one person's take on how to structure large LegoDOM applications. It is not enforced by the framework. You are encouraged to adapt, improve, or completely ignore it.

---

In LegoDOM v2, everything is a Block. But not all Blocks are created equal. Some are microscopic "bricks", others are entire page layouts.

To keep sanity, we categorize Blocks by their **Role** and **Scope**.

## The Hierarchy

| Type | Role | Knows About | Example |
| :--- | :--- | :--- | :--- |
| **Atomic Block** | Identity & Style | Its own visuals | `<block-avatar>`, `<block-button>` |
| **Molecule Block** | Interaction (Widget) | UI State only | `<block-dropdown>`, `<block-file-picker>` |
| **Logic Block** | Business Logic | Data & API calls | `<block-profile-settings>`, `<block-checkout>` |
| **Page Block** | Coordination | Layout & Routing | `<page-dashboard>`, `<page-login>` |


## The Litmus Test: The Avatar Upload

**The Question:**
> I have an avatar. When I click it, it opens a file picker. When the file changes, it POSTs to `/v1/avatars`. What is it?

**The "Lego Way" Solution:**
Split this into its three atomic truths.

### 1. The Atomic Block (Identity)
**Role:** Just the visuals. Circular crop, fallback, size classes.
**Naming:** `block-avatar.lego`

```html
<template>
  <img class="avatar" src="[[ src ]]" alt="[[ alt ]]">
</template>
```

### 2. The Molecule Block (Interaction)
**Role:** The mechanic. Wraps content and makes it clickable to open a file dialog.
**Naming:** `block-file-trigger.lego`

```html
<template>
  <div @click="openPicker()">
    <slot></slot>
    <input type="file" b-var="input" @change="emitFile">
  </div>
</template>
```

### 3. The Logic Block (Context)
**Role:** The boss. Assembles the parts and owns the API call.
**Naming:** `block-profile-settings.lego`

```html
<template>
  <h2>Your Profile</h2>
  <block-file-trigger @file-selected="uploadAvatar">
    <block-avatar src="[[ user.avatarUrl ]]"></block-avatar>
  </block-file-trigger>
</template>

<script>
export default {
  // Only this block knows about /v1/avatars
  async uploadAvatar(e) { /* ... */ }
}
</script>
```

## The Definitions

### Atomic Blocks (Bricks)
An Atomic Block cannot be broken down safely. It is self-contained.
-   **State:** Visual only. "Is mouse over me?".
-   **Rule:** If you find yourself nesting Blocks inside other Blocks, you have graduated to a Molecule.

### Molecule Blocks (Widgets)
A Molecule gives Atomic Blocks a reason to exist together. It defines *how* an interaction works without embedding *who* it's for.
-   **State:** Internal UI state only. "Is open?", "Is active?".
-   **Communication:** Uses `$emit()` to broadcast events. Never makes API calls.

### Logic Blocks (Organisms)
Logic Blocks are where your app features come to life. They are bound to specific data and rules.
-   **State:** Domain-specific. Owns data fetched from APIs.
-   **Rule:** A Logic Block knows *what* data it owns and *what* outcome it must produce.

### Page Blocks (Layouts)
Page Blocks are the top-level hosts.
-   **Role:** Define the grid. Orchestrate Logic Blocks.
-   **Rule:** Pages are the *only* UI units directly known to `<lego-router>`.

## Recommended Directory Structure

```text
src/
├── blocks/
│   ├── atoms/
│   │   ├── block-avatar.lego
│   │   └── block-button.lego
│   ├── molecules/
│   │   ├── block-dropdown.lego
│   │   └── block-modal.lego
│   └── logic/
│       ├── block-profile-settings.lego
│       └── block-order-history.lego
├── pages/
│   ├── page-dashboard.lego
│   └── page-login.lego
└── main.js
```

## Summary

| If you keep it all in one file... | The "Block" Standard |
| :--- | :--- |
| Name it `<block-avatar-upload>` and accept it is not reusable. | Let the **Molecule** handle the interaction. Let the **Logic Block** handle the transaction. |
