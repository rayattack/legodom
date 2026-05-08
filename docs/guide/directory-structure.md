# Everything is a Block

> [!NOTE] This is a Recommendation, Not a Rule
> This page is one person's take on how to structure large LegoDOM applications. It is not enforced by the framework. You are encouraged to adapt, improve, or completely ignore it.

---

In LegoDOM, everything is a Block. But not all Blocks are created equal. Some are microscopic "bricks", others are entire page layouts.

To keep sanity, we categorize Blocks into **four tiers**.

## The Four Tiers

| Type | Role | Knows About | Example |
| :--- | :--- | :--- | :--- |
| **Core** | Reusable UI primitives | Its own visuals & interactions | `block-avatar`, `block-dropdown`, `block-button` |
| **Widget** | Core aggregator | Combines core blocks, local state | `widget-user-card`, `widget-search-bar` |
| **Page** | Business logic & layout | Data, APIs, domain state | `page-dashboard`, `page-login` |
| **Shell** | Top-level container | Layout, routing, slotting | `app-shell`, `admin-shell` |

## The Key Distinction

**Core Blocks** are generic and reusable. They don't know about your business domain.

**Widgets** combine core blocks into richer UI. They may have local state but stay reusable.

**Pages** are feature-specific. They know about your APIs, data models, and workflows.

**Shells** are layout containers. They define where routed content appears.

```
┌─────────────────────────────────────────────────────────────┐
│  Core Blocks                │  Widgets                      │
│  ───────────                │  ───────                      │
│  "How does a dropdown       │  "How does a user card        │
│   work?"                    │   display an avatar and       │
│                             │   a name together?"           │
│  ✅ Reusable anywhere       │  ✅ Reusable across pages     │
│  ❌ No API calls            │  ❌ No API calls              │
│  ❌ No domain knowledge     │  ❌ No domain knowledge       │
├─────────────────────────────┼───────────────────────────────┤
│  Pages                      │  Shells                       │
│  ─────                      │  ──────                       │
│  "When the user selects     │  "Where does the sidebar go?  │
│   'Premium', call           │   Where does <lego-router>    │
│   /api/upgrade."            │   render?"                    │
│                             │                               │
│  ✅ Feature-specific        │  ✅ Layout & slotting          │
│  ✅ Makes API calls         │  ✅ Routing targets            │
│  ✅ Owns domain state       │  ❌ No business logic          │
└─────────────────────────────┴───────────────────────────────┘
```

## The Litmus Test: The Avatar Upload

**The Question:**
> I have an avatar. When I click it, it opens a file picker. When the file changes, it POSTs to `/v1/avatars`. What is it?

**The "Lego Way" Solution:**
Split this into core blocks and a page.

### 1. Core Block: The Avatar
**Role:** Just the visuals. Circular crop, fallback, size classes.

```html
<!-- block-avatar.lego -->
<template>
  <img class="avatar" src="[[ src ]]" alt="[[ alt ]]">
</template>
```

### 2. Core Block: The File Trigger
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

### 3. Page: Profile Settings
**Role:** The feature. Assembles the core blocks and owns the API call.

```html
<!-- page-profile-settings.lego -->
<script>
export default {
  // Only this page knows about /v1/avatars
  async uploadAvatar(file) {
    const form = new FormData();
    form.append('avatar', file);
    await fetch('/v1/avatars', { method: 'POST', body: form });
  }
}
</script>

<template>
  <h2>Your Profile</h2>
  <block-file-trigger @file-selected="uploadAvatar">
    <block-avatar src="[[ user.avatarUrl ]]"></block-avatar>
  </block-file-trigger>
</template>
```

## The Definitions

### Core Blocks
Reusable UI primitives. They handle visuals and generic interactions.

- **State:** Visual/UI only. "Is dropdown open?", "Is button hovered?"
- **Communication:** Uses `$emit()` to broadcast events. **Never makes API calls.**
- **Examples:** `block-avatar`, `block-button`, `block-dropdown`, `block-modal`, `block-file-trigger`

### Widgets
Combinations of core blocks into richer, reusable UI units.

- **State:** Local/presentational. Combines core blocks with some coordination logic.
- **Communication:** Uses `$emit()` and props via `b-data`. **No API calls.**
- **Examples:** `widget-user-card`, `widget-search-bar`, `widget-toolbar`

### Pages
Feature-specific blocks. They orchestrate widgets and core blocks, own business logic.

- **State:** Domain-specific. Owns data fetched from APIs.
- **Responsibility:** Knows *what* data it owns and *what* outcome it must produce.
- **Examples:** `page-dashboard`, `page-login`, `page-profile-settings`

### Shells
Top-level layout containers. They define the page structure and routing slots.

- **Role:** Define the grid. Provide `<lego-router>` targets. Handle navigation chrome.
- **Routing:** Shells are the *only* blocks directly known to `<lego-router>`.
- **Examples:** `app-shell`, `admin-shell`, `auth-shell`

## Recommended Directory Structure

```text
src/
├── core/
│   ├── block-avatar.lego
│   ├── block-button.lego
│   ├── block-dropdown.lego
│   ├── block-modal.lego
│   └── block-file-trigger.lego
├── widgets/
│   ├── widget-user-card.lego
│   ├── widget-search-bar.lego
│   └── widget-toolbar.lego
├── pages/
│   ├── auth/
│   │   ├── page-login.lego
│   │   └── page-register.lego
│   ├── hris/
│   │   ├── page-employees.lego
│   │   └── page-payroll.lego
│   └── page-dashboard.lego
├── shells/
│   ├── app-shell.lego
│   └── admin-shell.lego
└── main.js
```

## Summary

| Question | Answer |
| :--- | :--- |
| Is it a reusable UI primitive? | **Core Block** |
| Does it combine core blocks into a richer unit? | **Widget** |
| Does it make API calls or own domain state? | **Page** |
| Is it a top-level layout with routing? | **Shell** |
