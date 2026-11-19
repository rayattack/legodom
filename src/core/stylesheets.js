import { config } from '../utils/helpers.js';
import { activeBlocks, getDefinition } from './registry.js';

export const styleRegistry = new Map();
export let styleConfig = {};

export const setStyleConfig = (cfg) => { styleConfig = cfg; };

export const loadStylesheets = async () => {
  // Pre-load all defined style sets into Constructable Stylesheets
  const loadPromises = Object.entries(styleConfig).map(async ([key, urls]) => {
    const sheets = await Promise.all(urls.map(async (url) => {
      try {
        if (url instanceof CSSStyleSheet) return url;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Status ${response.status}`);
        const cssText = await response.text();
        const sheet = new CSSStyleSheet();
        await sheet.replace(cssText);
        return sheet;
      } catch (e) {
        console.error(`[Lego] Failed to load stylesheet: ${url}`, e);
        return null;
      }
    }));
    styleRegistry.set(key, sheets.filter(s => s !== null));
  });
  await Promise.all(loadPromises);

  // Re-apply stylesheets to blocks that initialized before styleRegistry was populated
  if (config.debug) console.log('[Lego Debug] Re-applying stylesheets to', activeBlocks.size, 'blocks');
  activeBlocks.forEach(block => {
    applyStyles(block);
  });
};

/** A block opts out of Shadow DOM with `b-shadow="false"` on its template. */
export const isLightBlock = (tagName) => {
  const definition = getDefinition(tagName);
  return !!definition && definition.shadow === false;
};

// One <style> per light-DOM block, however many instances the page mounts.
const injectedLightStyles = new Set();

// CSSOM rule type constants, named so the recursion below reads as intent
// rather than as bare numbers.
const STYLE_RULE = 1;
const MEDIA_RULE = 4;
const SUPPORTS_RULE = 12;

/**
 * Confine one selector to a light-DOM block. `self` (and `:host`, which the
 * shadow path rewrites `self` into) becomes the tag itself; everything else is
 * a descendant of it.
 */
const scopeSelector = (selector, tagName) => {
  const trimmed = selector.trim();
  const replaced = trimmed.replace(/(?<![-\w])(?:self|:host)(?![-\w])/g, tagName);
  if (replaced !== trimmed) return replaced;
  return `${tagName} ${trimmed}`;
};

/**
 * Re-serialize a rule list with every selector scoped. Conditional groups
 * recurse into their own rules; `@keyframes`, `@font-face` and anything else
 * without selectors are copied through untouched, since scoping them would
 * change what they mean.
 */
const scopeRules = (rules, tagName) => {
  let out = '';
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (rule.type === STYLE_RULE) {
      out += `${rule.selectorText.split(',').map(s => scopeSelector(s, tagName)).join(', ')} { ${rule.style.cssText} }\n`;
      continue;
    }
    if (rule.type === MEDIA_RULE || rule.type === SUPPORTS_RULE) {
      const condition = rule.type === MEDIA_RULE ? `@media ${rule.media.mediaText}` : `@supports ${rule.conditionText}`;
      out += `${condition} {\n${scopeRules(rule.cssRules, tagName)}}\n`;
      continue;
    }
    out += `${rule.cssText}\n`;
  }
  return out;
};

/**
 * Where a light DOM block's scoped `<style>` has to live.
 *
 * A style in `document.head` cannot reach inside a shadow root, so a light
 * DOM block nested in a shadow block used to render completely unstyled while
 * the same block at the top level rendered correctly. The server has always
 * emitted the style next to the block, which made this a real server/client
 * divergence rather than only a missing feature.
 *
 * The style therefore goes wherever the block actually is: `document.head`
 * for a block in the main tree, and the containing shadow root for a nested
 * one. Deduplication follows, keyed per root, so one shadow root holding
 * three instances of a block still ends up with a single copy.
 */
const rootFor = (styleEl) => {
  const root = styleEl.getRootNode ? styleEl.getRootNode() : document;
  if (root && root.nodeType === 11 && root.host) return root;
  return document.head;
};

const adoptedByRoot = new WeakMap();

/**
 * The fallback when the environment hands back no CSSOM to read.
 *
 * Leaving the CSS exactly as authored used to be harmless, because an
 * unscoped rule injected into `document.head` is at least a working global
 * rule. Once a nested block's style goes into the shadow root that contains
 * it, that stopped being true: `self` matches no element, so the fallback
 * silently produced rules that can never apply.
 *
 * Rewriting the one selector that cannot survive on its own is not full
 * scoping, and it does not pretend to be. It only keeps the fallback from
 * being worse than doing nothing. Strings and comments are stashed first for
 * the same reason `rewriteHostSelectors` does it in lifecycle.js: a
 * `content: "self"` declaration is not a selector.
 */
const rewriteSelfToTag = (css, tagName) => {
  const segments = [];
  const SENTINEL = '__LEGO_SEG_';
  const protectedCss = css.replace(
    /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (m) => {
      segments.push(m);
      return `${SENTINEL}${segments.length - 1}__`;
    }
  );
  return protectedCss
    .replace(/(?<![-\w])self(?![-\w])/g, tagName)
    .replace(new RegExp(`${SENTINEL}(\\d+)__`, 'g'), (_, i) => segments[+i]);
};

const alreadyAdopted = (root, tagName) => {
  let seen = adoptedByRoot.get(root);
  if (!seen) {
    seen = new Set();
    adoptedByRoot.set(root, seen);
  }
  if (seen.has(tagName)) return true;
  seen.add(tagName);
  return false;
};

/**
 * Move a light-DOM block's <style> into its root, scoped to its tag.
 *
 * There is no shadow boundary to do the confining, so every selector is
 * rewritten. The injected element is also the parser: appending it gives us a
 * real CSSOM to read, which is far more trustworthy than a regex over the
 * source. If the environment gives us no sheet, the CSS stays as written
 * (global) rather than being dropped.
 *
 * @param {string} tagName - the block being styled
 * @param {HTMLStyleElement} styleEl - the <style> from the rendered template
 */
export const adoptLightStyle = (tagName, styleEl) => {
  const css = styleEl.textContent;
  const root = rootFor(styleEl);
  styleEl.remove();
  if (root === document.head) injectedLightStyles.add(tagName);
  if (alreadyAdopted(root, tagName)) return;

  const injected = document.createElement('style');
  injected.setAttribute('data-lego-style', tagName);
  injected.textContent = css;
  root.appendChild(injected);

  try {
    if (injected.sheet && injected.sheet.cssRules) {
      injected.textContent = scopeRules(injected.sheet.cssRules, tagName);
    } else {
      injected.textContent = rewriteSelfToTag(css, tagName);
    }
  } catch (e) {
    console.warn(`[Lego] Could not scope styles for light-DOM block <${tagName}>:`, e);
  }
};

/**
 * Adopt the `<style>` a server rendered light DOM block shipped inside its
 * host.
 *
 * Those rules are already scoped: src/server/css.js applies the very same
 * tag-name prefixes this module does, so re-running the scoping pass over
 * them would double the prefix. The element is moved into `document.head` as
 * it stands, or simply dropped when a copy is already there, which is what
 * every instance after the first one finds.
 *
 * @param {string} tagName - the block being styled
 * @param {HTMLStyleElement} styleEl - the <style> the server emitted
 */
export const adoptServerLightStyle = (tagName, styleEl) => {
  if (!styleEl) {
    injectedLightStyles.add(tagName);
    return;
  }
  // Same rule as the client path: the style belongs to the root the block is
  // actually in, so a nested light DOM block keeps its rules inside the shadow
  // root that contains it rather than losing them to document.head.
  const root = rootFor(styleEl);
  if (root === document.head) injectedLightStyles.add(tagName);
  const present = alreadyAdopted(root, tagName)
    || !!root.querySelector(`style[data-lego-style="${tagName}"]`);
  if (present) {
    styleEl.remove();
    return;
  }
  styleEl.setAttribute('data-lego-style', tagName);
  root.appendChild(styleEl);
};

export const applyStyles = (el) => {
  const name = el.tagName.toLowerCase();
  const definition = getDefinition(name);
  // A light-DOM block has no private root, so its stylesheets are adopted by
  // the document. They are deduplicated on the way in, so two instances of
  // the same block adopt one copy.
  const shadow = el.shadowRoot || el._legoShadow || (isLightBlock(name) ? document : null);
  if (!shadow) return;

  // Stylesheet Application: Definition + Instance + Inheritance (Cascade)
  // An element with no definition (a bare host being styled early) simply
  // contributes no definition-level sheets.
  const defStyles = ((definition && definition.styles) || "").split(/\s+/).filter(Boolean);
  const instStyles = (el.getAttribute('b-stylesheets') || "").split(/\s+/).filter(Boolean);

  // Calculate inherited styles from ancestors with b-cascade
  const inheritedStyles = [];
  let parent = el.parentElement || (el.getRootNode ? el.getRootNode().host : null);
  while (parent) {
    // Check instance cascade
    const instCascade = (parent.getAttribute('b-cascade') || "").split(/\s+/).filter(Boolean);
    if (instCascade.length) inheritedStyles.push(...instCascade);

    // Check definition cascade (if parent is a Lego block). Audit fix #17:
    // the cascade is split once at registration and kept on the definition
    // entry, so this walk stays O(1) per ancestor.
    const pName = parent.tagName ? parent.tagName.toLowerCase() : '';
    const parentDefinition = getDefinition(pName);
    const defCascade = parentDefinition && parentDefinition.cascadeList;
    if (defCascade && defCascade.length) inheritedStyles.push(...defCascade);
    parent = parent.parentElement || (parent.getRootNode && parent.getRootNode().host);
  }

  const explicit = [...new Set([...defStyles, ...instStyles])];
  const inherited = [...new Set(inheritedStyles)]; // Dedup inherited
  const allStyleNames = [...new Set([...inherited, ...explicit])]; // Dedup all

  if (allStyleNames.length > 0) {
    const sheetsToApply = allStyleNames.flatMap(key => styleRegistry.get(key) || []);
    if (sheetsToApply.length > 0) {
      if (config.debug) console.log('[Lego Debug] Applying styles to', el.tagName, '- Names:', allStyleNames, '- Sheets:', sheetsToApply.length);
    }
    if (sheetsToApply.length > 0 && shadow.adoptedStyleSheets) {
      const existing = shadow.adoptedStyleSheets.filter(s => !sheetsToApply.includes(s));
      shadow.adoptedStyleSheets = [...existing, ...sheetsToApply];
    }
  }

  // Metadata for DevTools
  el._studsMeta = {
    stylesheets: {
      explicit,
      inherited,
      applied: allStyleNames
    }
  };
}
