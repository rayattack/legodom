import { compile } from './expression.js';
import { findAncestor } from './dom.js';
import { defaultApp } from '../core/globals.js';
import { mount } from '../features/mount.js';
import { getDelimiters } from './helpers.js';

const MAX_REPORTED_SOURCE = 80;

// Plain Map, not an LRU: only author-written b-logic that the compiler cannot
// represent lands here, which is a small fixed set per application.
const logicCache = new Map();

const truncate = (raw) =>
  raw.length > MAX_REPORTED_SOURCE ? `${raw.slice(0, MAX_REPORTED_SOURCE)}...` : raw;

const warnDenied = (expr) => {
  console.warn(`[Lego] Security Warning: Blocked dangerous expression "${expr}"`);
};

/**
 * Evaluate a template expression.
 *
 * Expressions are compiled to closures by expression.js: no `new Function`,
 * no `with`, and no reachable host globals. Identifier lookup order is
 * helpers, then state, then the named context values (global/self/event/
 * $event/helpers), then a small allowlist of safe globals. Anything else is
 * a ReferenceError.
 *
 * @param {string} expr - Expression source
 * @param {object} context - { state, global, self, event, app }. `app` decides
 *   whose globals `$route`/`$db` read, whose routes `$go` navigates, whose
 *   `$registry` is consulted and whether strict mode applies. Callers with no
 *   app in hand (tests, pure uses) get the default app.
 * @param {boolean} [throwError=true] - Re-throw evaluation errors
 */
export const safeEval = (expr, context, throwError = true) => {
  const scope = context.state || {};
  const app = context.app || defaultApp;
  try {
    const fn = compile(expr);

    // $route, $params and $db are accessors, not values. Reading them off
    // `globals` eagerly would happen on every expression evaluation, which
    // would make every binding in the application a dependency of the route
    // object and re-run the lot on each navigation. As getters, only the
    // expressions that actually name them subscribe.
    const helpers = {
      $ancestors: (tag) => findAncestor(context.self, tag),
      $element: context.self,
      $registry: (tag) => app.sharedStates.get(tag.toLowerCase()),
      get $route() { return app.globals.$route; },
      get $params() { return app.globals.$route?.params || {}; },
      $go: (path, ...targets) => app.router.go(path, ...targets)(context.self),
      get $db() { return app.globals.$db; },
      $mount: (tagName, target, props) => mount(tagName, target, props),
      $emit: (name, detail) => {
        context.self.dispatchEvent(new CustomEvent(name, {
          detail,
          bubbles: true,
          composed: true
        }));
      }
    };

    const result = fn(scope, {
      helpers,
      global: context.global,
      self: context.self,
      event: context.event
    });

    // Audit fix #32: only auto-invoke a function-typed result when we're
    // evaluating in event-handler context (renderer.js bind() is the only
    // call site that passes `event`). Previously a state field that
    // happened to be a function was silently called by every text/attr
    // interpolation that read it. Bare-name patterns like `b-init="setup"`
    // (relying on auto-call) need explicit parens: `b-init="setup()"`.
    if (typeof result === 'function' && context.event !== undefined) {
      return result.call(scope, context.event);
    }
    return result;
  } catch (e) {
    // A denied property (__proto__ / constructor / prototype / the reflection
    // helpers) is never fatal: warn and render nothing, as the old blocklist
    // did.
    if (e && e.denied) {
      warnDenied(expr);
      return undefined;
    }
    if (throwError) throw e;
    // Audit fix #26: by default we swallow ReferenceErrors so a single
    // template typo or a transiently-undefined state key doesn't take
    // down the page. In strict mode (`Lego.config.strict = true`) we
    // re-throw so the error boundary surfaces the typo immediately
    // during development. Other error classes always re-throw.
    if (e instanceof ReferenceError && !app.config.strict) return undefined;
    throw e;
  }
};

let _legacyLogicWarned = false;

/**
 * Escape hatch for b-logic bodies the expression parser cannot represent,
 * i.e. method shorthand with statement bodies: `{ count: 0, inc() { ... } }`.
 * Those need a real function body, which a template-expression grammar does
 * not have. Only reached after the compiler reports a SyntaxError.
 *
 * This is the one remaining `new Function` in the runtime. Move methods into
 * the block's script section to drop the CSP `unsafe-eval` requirement.
 */
const evalLogicWithFunctionFallback = (str, scope, globals) => {
  if (!_legacyLogicWarned) {
    _legacyLogicWarned = true;
    console.warn('[Lego] b-logic method bodies compile through Function(), which ' +
      'needs CSP unsafe-eval. Move methods into the block script.');
  }
  let fn = logicCache.get(str);
  if (!fn) {
    fn = new Function('scope', 'global', `with(global) { with(scope) { return (${str}); } }`);
    logicCache.set(str, fn);
  }
  return fn(scope, globals);
};

/**
 * Fallback ladder for a b-logic body the compiler rejected: retry it wrapped
 * in braces, then (only for a syntax error) hand it to the Function()
 * escape hatch. The error reported is the original one unless the fallback
 * itself failed.
 */
const recoverLogic = (raw, scope, ctx, original, globals) => {
  let error = original;
  // A bare property list (`name: 'x', count: 0`) is retried wrapped in braces.
  const trimmed = raw.trim();
  const braced = (!trimmed.startsWith('{') && trimmed.includes(':')) ? `{${raw}}` : null;
  if (braced) {
    try {
      return compile(braced)(scope, ctx);
    } catch (ignored) { /* keep the original error */ }
  }
  if (error instanceof SyntaxError) {
    try {
      return evalLogicWithFunctionFallback(braced || raw, scope, globals);
    } catch (fallbackError) { error = fallbackError; }
  }
  if (error && error.denied) {
    warnDenied(truncate(raw));
    return {};
  }
  console.error(`[Lego] Error parsing b-logic: "${truncate(raw)}"`, error);
  return {};
};

/**
 * Parse a `b-logic` / `b-data` attribute into a plain object.
 *
 * Identifier lookup order here is scope (the parent block's state) first,
 * then globals, then the safe-global allowlist.
 *
 * @param {string} raw - Attribute source
 * @param {object} [scope={}] - Parent scope for scoped props
 * @param {object} [app] - the app whose delimiters and globals apply
 */
export const parseJSObject = (raw, scope = {}, app = defaultApp) => {
  if (!raw || raw.trim() === '{}') return {};
  const globals = app.globals;

  // Guardrail: refuse to evaluate b-logic that contains template delimiters.
  // The body is run as JavaScript, so an interpolated `[[user.bio]]` reaching
  // this path is RCE. Templating into b-logic is never the right pattern:
  // use script logic and pass values through state instead.
  const [start, end] = getDelimiters(app.config);
  if (raw.includes(start) && raw.includes(end)) {
    console.error(
      `[Lego] Refusing to parse b-logic containing template delimiters ` +
      `("${start}...${end}"): it is evaluated as JavaScript, so templating user ` +
      `data into it is unsafe. Pass values through state instead. ` +
      `Got: "${truncate(raw)}"`
    );
    return {};
  }

  const ctx = { extra: globals, global: globals };
  try {
    return compile(raw)(scope, ctx);
  } catch (e) {
    return recoverLogic(raw, scope, ctx, e, globals);
  }
};
