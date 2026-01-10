
# 06. Target Resolver: Scoping and Logic

In the previous chapters, we used `b-target` to send content to different parts of the page. But how does LegoDOM actually find those "holes" in a complex, nested DOM? This is where the **Target Resolver** comes in.

The Target Resolver is a prioritized logic engine that ensures your links always find the correct destination, even in massive applications with thousands of components.

## The Problem with Global Selectors

In traditional JavaScript, if you use `document.querySelector('#detail-view')`, the browser searches the entire page. This is fine for small sites, but in a "Web Component First" architecture, it causes two major issues:

1.  **ID Collisions**: If you accidentally use the same ID in two different components, your link might update the wrong part of the page.
    
2.  **Tight Coupling**: Your sidebar link has to know the exact global ID of the main content area, making it harder to move components around.
    

## The Resolver Hierarchy

When you click a `b-link` with a `b-target`, LegoDOM follows a strict search order to resolve the target:

### 1. Local Component Scope (The Primary Search)

LegoDOM first looks for the target **inside the component that contains the link**.

If you use `b-target="email-view"`, Lego looks for an `<email-view>` tag _within the current parent shell_. This allows you to have multiple instances of the same layout on one screen without them interfering with each other.

### 2. Tag Name Resolution (The Web Component Way)

If your target doesn't start with a `#`, Lego treats it as a **Component Tag Name**.

```
<!-- Lego looks for a <thread-view> tag nearby -->
<a href="/chat/1" b-link b-target="thread-view">Open Chat</a>

<thread-view></thread-view>

```

This is the most "Enterprise" way to build. It makes your HTML self-documenting. You aren't targeting a generic `div`; you are targeting a specific functional slot.

### 3. Global ID Fallback

If no local tag or element matches, the resolver expands its search to the entire `document` using ID selectors.

```
<!-- Lego looks for any element with id="global-sidebar" -->
<a href="/menu" b-link b-target="#global-sidebar">Menu</a>

```

### 4. The Router Default

If the resolver exhausts all options and still can't find the target, it defaults to the `<lego-router>`. This ensures that even if you make a typo in your target name, the user still sees the content (it just might take over the whole page instead of a small fragment).

## Advanced: The Functional Target

For highly dynamic UIs, `b-target` can even be a function or a dynamic expression.

```
<!-- Logic decides the target based on screen size -->
<a href="/settings" b-link b-target="{{ isMobile ? '#main' : 'settings-pane' }}">
  Settings
</a>

```

## Why This Matters

By prioritizing local tags over global IDs, LegoDOM encourages **Encapsulation**. Your components become "Black Boxes" that manage their own internal routing targets. This means you can take a complex "Messaging Shell" and drop it into a "Dashboard Shell" without changing a single line of routing code—the targets will still resolve correctly because they are scoped to their parents.

## Summary

The Target Resolver turns string attributes into intelligent DOM navigation. It respects the boundaries of your Web Components while providing a robust fallback system.

