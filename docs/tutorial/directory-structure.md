# Everything is a Block

> [!NOTE] This is a Recommendation, Not a Rule
> This page is one person's take on how to structure large LegoDOM applications. It is not enforced by the framework. You are encouraged to adapt, improve, or completely ignore it.

---

In LegoDOM, everything is a Block. But not all Blocks are created equal. Some are microscopic "bricks", others are entire page layouts.

To keep sanity, we categorize Blocks into **four tiers**.

## The Four Tiers

| Type | Role | Knows About | Example |
| :--- | :--- | :--- | :--- |
| **Brick** | Reusable UI primitives | Its own visuals & interactions | `avatar-brick`, `dropdown-brick`, `button-brick` |
| **Widget** | Brick aggregator | Combines bricks, local state | `user-card-widget`, `search-bar-widget` |
| **Page** | Business logic & layout | Data, APIs, domain state | `dashboard-page`, `login-page` |
| **Shell** | Top-level container | Layout, routing, slotting | `app-shell`, `admin-shell` |

## The Key Distinction

**Bricks** are generic and reusable. They don't know about your business domain.

**Widgets** combine bricks into richer UI. They may have local state but stay reusable.

**Pages** are feature-specific. They know about your APIs, data models, and workflows.

**Shells** are layout containers. They define where routed content appears.

```
┌─────────────────────────────────────────────────────────────┐
│  Bricks                     │  Widgets                      │
│  ──────                     │  ───────                      │
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
Split this into a brick and a page.

### 1. Brick: The Avatar
**Role:** Just the visuals. Circular crop, fallback, size classes.

```html
<!-- avatar-brick.lego -->
<template>
  <img class="avatar" src="[[ src ]]" alt="[[ alt ]]">
</template>
```

### 2. Brick: The File Trigger
**Role:** Generic interaction. Wraps content and makes it clickable to open a file dialog.

```html
<!-- file-trigger-brick.lego -->
<template>
  <div @click="openPicker()">
    <slot></slot>
    <input type="file" b-var="input" @change="$emit('file-selected', $vars.input.files[0])">
  </div>
</template>
```

### 3. Page: Profile Settings
**Role:** The feature. Assembles the bricks and owns the API call.

```html
<!-- profile-settings-page.lego -->
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
  <file-trigger-brick @file-selected="uploadAvatar">
    <avatar-brick src="[[ user.avatarUrl ]]"></avatar-brick>
  </file-trigger-brick>
</template>
```

## The Definitions

### Bricks
Reusable UI primitives. They handle visuals and generic interactions.

- **State:** Visual/UI only. "Is dropdown open?", "Is button hovered?"
- **Communication:** Uses `$emit()` to broadcast events. **Never makes API calls.**
- **Examples:** `avatar-brick`, `button-brick`, `dropdown-brick`, `modal-brick`, `file-trigger-brick`

### Widgets
Combinations of bricks into richer, reusable UI units.

- **State:** Local/presentational. Combines bricks with some coordination logic.
- **Communication:** Uses `$emit()` and props via `b-data`. **No API calls.**
- **Examples:** `user-card-widget`, `search-bar-widget`, `toolbar-widget`

### Pages
Feature-specific blocks. They orchestrate widgets and bricks, own business logic.

- **State:** Domain-specific. Owns data fetched from APIs.
- **Responsibility:** Knows *what* data it owns and *what* outcome it must produce.
- **Examples:** `dashboard-page`, `login-page`, `profile-settings-page`

### Shells
Top-level layout containers. They define the page structure and routing slots.

- **Role:** Define the grid. Provide `<lego-router>` targets. Handle navigation chrome.
- **Routing:** Shells are the *only* blocks directly known to `<lego-router>`.
- **Examples:** `app-shell`, `admin-shell`, `auth-shell`

## Recommended Directory Structure

```text
src/
├── bricks/
│   ├── avatar-brick.lego
│   ├── button-brick.lego
│   ├── dropdown-brick.lego
│   ├── modal-brick.lego
│   └── file-trigger-brick.lego
├── widgets/
│   ├── user-card-widget.lego
│   ├── search-bar-widget.lego
│   └── toolbar-widget.lego
├── pages/
│   ├── auth/
│   │   ├── login-page.lego
│   │   └── register-page.lego
│   ├── hris/
│   │   ├── employees-page.lego
│   │   └── payroll-page.lego
│   └── dashboard-page.lego
├── shells/
│   ├── app-shell.lego
│   └── admin-shell.lego
└── main.js
```

## Summary

| Question | Answer |
| :--- | :--- |
| Is it a reusable UI primitive? | **Brick** |
| Does it combine bricks into a richer unit? | **Widget** |
| Does it make API calls or own domain state? | **Page** |
| Is it a top-level layout with routing? | **Shell** |
