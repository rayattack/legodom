import { LRUCache } from './lru-cache.js';
import { findAncestor } from './dom.js';
import { sharedStates } from '../core/registry.js';
import { globals } from '../core/globals.js';
import { _go } from '../features/router.js';
import { mount } from '../features/mount.js';
import { getDelimiters, config } from './helpers.js';

const expressionCache = new LRUCache(1000);
const logicCache = new LRUCache(500);

// Audit fix #23: split the blocklist into a strict tier and a "bareword
// only" tier.
//
//   - STRICT covers patterns where the *property-access* form is itself a
//     known sandbox-escape vector. `obj.constructor.constructor("…")()`
//     and `obj.__proto__.constructor.…` reach Function regardless of
//     whether they appear as bareword or member access, so we keep
//     blocking those words wherever they show up. `eval` and `import`
//     have no innocuous member-access form in template-shaped JS.
//
//   - SOFT covers identifiers that collide with the strict regex by
//     accident — `item.class` (CSS class name field), `pkg.module`
//     (string property), `schema.prototype` (a structure field that
//     happens to share the name). The lookbehind `(?<![\w.$])` allows
//     these as member access while still blocking the bareword/keyword
//     form (e.g. `class { … }`, `prototype = X`). `prototype` blocking
//     is mostly defence-in-depth here since `constructor` stays blocked
//     in STRICT; without `.constructor` no Function-escape chain
//     completes anyway.
const STRICT_BLOCK = /\b(eval|import|constructor|__proto__)\b/;
const SOFT_BLOCK = /(?<![\w.$])(class|module|prototype)(?![\w$])/;

export const safeEval = (expr, context, throwError = true) => {
  // 1. Security: Block dangerous patterns
  if (STRICT_BLOCK.test(expr) ||
      SOFT_BLOCK.test(expr) ||
      /\[\s*['"`].*\+|\+.*['"`]\s*\]/.test(expr)) {
    console.warn(`[Lego] Security Warning: Blocked dangerous expression "${expr}"`);
    return undefined;
  }

  try {
    const scope = context.state || {};

    // 2. Performance: Check cache
    let func = expressionCache.get(expr);
    if (!func) {
      // Scope order: helpers first (for $route, $go, etc.), then state
      func = new Function('global', 'self', 'event', 'helpers', `
          with(this) {
            with(helpers) { 
              return ${expr}
            }
          }
        `);
      expressionCache.set(expr, func);
    }

    const helpers = {
      $ancestors: (tag) => findAncestor(context.self, tag),
      $registry: (tag) => sharedStates.get(tag.toLowerCase()),
      $element: context.self,
      $route: globals.$route,
      $params: globals.$route?.params || {},
      $go: (path, ...targets) => _go(path, ...targets)(context.self),
      $db: globals.$db,
      $mount: (tagName, target, props) => mount(tagName, target, props),
      $emit: (name, detail) => {
        context.self.dispatchEvent(new CustomEvent(name, {
          detail,
          bubbles: true,
          composed: true
        }));
      }
    };

    const result = func.call(scope, context.global, context.self, context.event, helpers);
    // Audit fix #32: only auto-invoke a function-typed result when we're
    // evaluating in event-handler context (renderer.js bind() is the only
    // call site that passes `event`). Previously a state field that
    // happened to be a function was silently called by every text/attr
    // interpolation that read it — surprise side effects + a `.toString()`-
    // shaped output was never observable. Bare-name patterns like
    // `b-init="setup"` (relying on auto-call) now need explicit parens:
    // `b-init="setup()"`. Tests cover the new gate.
    if (typeof result === 'function' && context.event !== undefined) {
      return result.call(scope, context.event);
    }
    return result;
  } catch (e) {
    if (throwError) throw e;
    // Audit fix #26: by default we swallow ReferenceErrors so a single
    // template typo or a transiently-undefined state key doesn't take
    // down the page. In strict mode (`Lego.config.strict = true`) we
    // re-throw so the error boundary surfaces the typo immediately
    // during development. Other error classes always re-throw.
    if (e instanceof ReferenceError && !config.strict) return undefined;
    throw e;
  }
};

export const parseJSObject = (raw, scope = {}) => {
  if (!raw || raw.trim() === '{}') return {};

  // Guardrail: refuse to evaluate b-logic that contains template delimiters.
  // The body is run as JavaScript, so an interpolated `[[user.bio]]` reaching
  // this path is RCE. Templating into b-logic is never the right pattern —
  // use script logic and pass values through state instead.
  const [start, end] = getDelimiters();
  if (raw.includes(start) && raw.includes(end)) {
    console.error(
      `[Lego] Refusing to parse b-logic containing template delimiters ("${start}...${end}"). ` +
      `b-logic is evaluated as JavaScript; templating user data into it is unsafe. ` +
      `Pass values through state instead. Got: "${raw.length > 80 ? raw.slice(0, 80) + '...' : raw}"`
    );
    return {};
  }

  const compile = (str) => {
    let fn = logicCache.get(str);
    if (!fn) {
      fn = new Function('scope', 'global', `with(global) { with(scope) { return (${str}); } }`);
      logicCache.set(str, fn);
    }
    return fn;
  };

  const attemptParse = (str) => compile(str)(scope, globals);

  try {
    return attemptParse(raw);
  } catch (e) {
    // Retry with braces if it looks like a property list (and didn't start with brace)
    const trimmed = raw.trim();
    if (!trimmed.startsWith('{') && trimmed.includes(':')) {
      try {
        return attemptParse(`{${raw}}`);
      } catch (e2) {
        // Fall through to original error handling
      }
    }

    console.error(`[Lego] Error parsing b-logic: "${raw.length > 80 ? raw.slice(0, 80) + '...' : raw}"`, e);
    return {};
  }
};
