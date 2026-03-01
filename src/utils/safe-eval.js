import { LRUCache } from './lru-cache.js';
import { findAncestor } from './dom.js';
import { sharedStates } from '../core/registry.js';
import { globals } from '../core/globals.js';
import { _go } from '../features/router.js';
import { mount } from '../features/mount.js';

const expressionCache = new LRUCache(1000);

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
    if (typeof result === 'function') return result.call(scope, context.event);
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

  const attemptParse = (str) => {
    return (new Function('scope', 'global', `with(global) { with(scope) { return (${str}); } }`))(scope, globals);
  };

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
