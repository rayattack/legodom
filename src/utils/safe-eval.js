import { LRUCache } from './lru-cache.js';
import { findAncestor } from './dom.js';
import { sharedStates } from '../core/registry.js';
import { globals } from '../core/globals.js';
import { _go } from '../features/router.js';
import { mount } from '../features/mount.js';
import { getDelimiters } from './helpers.js';

const expressionCache = new LRUCache(1000);
const logicCache = new LRUCache(500);

export const safeEval = (expr, context, throwError = true) => {
  // 1. Security: Block dangerous patterns
  if (/\b(eval|import|class|module|constructor|__proto__|prototype)\b/.test(expr) ||
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
    // Gracefully degrade for undefined variables (ReferenceError),
    // but re-throw other errors so error boundaries can catch them
    if (e instanceof ReferenceError) return undefined;
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
