# Everything is a Block

> [!NOTE] This is a Recommendation, Not a Rule
> This page is one person's take on how to structure large LegoDOM applications. It is not enforced by the framework. You are encouraged to adapt, improve, or completely ignore it.

---

In LegoDOM, everything is a Block. But not all Blocks are created equal. Some are microscopic "bricks", others are entire page layouts.

To keep sanity, we categorize Blocks into **three tiers**.

## The Three Tiers

| Type | Role | Knows About | Example |
| :--- | :--- | :--- | :--- |
| **Atomic Block** | Reusable UI | Its own visuals & interactions | `<block-avatar>`, `<block-dropdown>`, `<block-modal>` |
| **Logic Block** | Business Logic | Data & API calls | `<block-profile-settings>`, `<block-checkout>` |
| **Page Block** | Coordination | Layout & Routing | `<page-dashboard>`, `<page-login>` |

## The Key Distinction

**Atomic Blocks** are generic and reusable. They don't know about your business domain.

**Logic Blocks** are feature-specific. They know about your APIs, data models, and workflows.

```
┌─────────────────────────────────────────────────────────────┐
│  Atomic Blocks              │  Logic Blocks                 │
│  ─────────────              │  ────────────                 │
│  "How does a dropdown       │  "When the user selects       │
│   work?"                    │   'Premium', call /api/upgrade│
│                             │   and show the confetti."     │
│  ✅ Reusable anywhere       │  ✅ Feature-specific          │
│  ❌ No API calls            │  ✅ Makes API calls           │
│  ❌ No domain knowledge     │  ✅ Owns domain state         │
└─────────────────────────────────────────────────────────────┘
```

## The Litmus Test: The Avatar Upload

**The Question:**
> I have an avatar. When I click it, it opens a file picker. When the file changes, it POSTs to `/v1/avatars`. What is it?

**The "Lego Way" Solution:**
Split this into atomic and logic blocks.

### 1. Atomic Block: The Avatar
**Role:** Just the visuals. Circular crop, fallback, size classes.

```html
<!-- block-avatar.lego -->
<template>
  <img class="avatar" src="[[ src ]]" alt="[[ alt ]]">
</template>
```

### 2. Atomic Block: The File Trigger
**Role:** Generic interaction. Wraps content and makes it clickable to open a file dialog.

```html
<!-- block-file-trigger.lego -->
<template>
  <div @click="openPicker()">
    <slot></slot>
    <input type="file" b-var="input" @change="$emit('file-selected', $vars.input.files[0])">
  </div>
</template>
```

### 3. Logic Block: Profile Settings
**Role:** The feature. Assembles the atomic blocks and owns the API call.

```html
<!-- block-profile-settings.lego -->
<template>
  <h2>Your Profile</h2>
  <block-file-trigger @file-selected="uploadAvatar">
    <block-avatar src="[[ user.avatarUrl ]]"></block-avatar>
  </block-file-trigger>
</template>

<script>
export default {
  // Only this block knows about /v1/avatars
  async uploadAvatar(file) {
    const form = new FormData();
    form.append('avatar', file);
    await fetch('/v1/avatars', { method: 'POST', body: form });
  }
}
</script>
```

## The Definitions

### Atomic Blocks
Reusable UI primitives. They handle visuals and generic interactions.

- **State:** Visual/UI only. "Is dropdown open?", "Is button hovered?"
- **Communication:** Uses `$emit()` to broadcast events. **Never makes API calls.**
- **Examples:** `block-avatar`, `block-button`, `block-dropdown`, `block-modal`, `block-file-trigger`

### Logic Blocks
Feature-specific blocks. They orchestrate atomic blocks and own business logic.

- **State:** Domain-specific. Owns data fetched from APIs.
- **Responsibility:** Knows *what* data it owns and *what* outcome it must produce.
- **Examples:** `block-profile-settings`, `block-checkout`, `block-order-history`

### Page Blocks
Top-level layout blocks. They coordinate the screen.

- **Role:** Define the grid. Orchestrate Logic Blocks.
- **Routing:** Pages are the *only* blocks directly known to `<lego-router>`.
- **Examples:** `page-dashboard`, `page-login`, `page-settings`

## Recommended Directory Structure

```text
src/
├── blocks/
│   ├── atoms/
│   │   ├── block-avatar.lego
│   │   ├── block-button.lego
│   │   ├── block-dropdown.lego
│   │   ├── block-modal.lego
│   │   └── block-file-trigger.lego
│   └── logic/
│       ├── block-profile-settings.lego
│       ├── block-checkout.lego
│       └── block-order-history.lego
├── pages/
│   ├── page-dashboard.lego
│   └── page-login.lego
└── main.js
```

## Summary

| Question | Answer |
| :--- | :--- |
| Does it make API calls? | **Logic Block** |
| Is it reusable across features? | **Atomic Block** |
| Is it a full page layout? | **Page Block** |
