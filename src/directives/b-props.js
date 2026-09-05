import { compile } from '../utils/expression.js';
import { kebabCase } from '../utils/helpers.js';

/**
 * b-props: the prop contract for a block.
 *
 * A declared prop is an ordinary reactive state key with three extra
 * abilities: it can carry a default that is evaluated per instance, it can
 * carry a type that plain HTML attributes are coerced through, and it is the
 * set of names a parent may write with `:name="expr"`.
 *
 * Syntax, brace optional, comma separated:
 *   b-props="{ name, age }"
 *   b-props="title: String, count: Number = 0"
 *   b-props="items: Array = [], user = { id: 0 }"
 *
 * A type is one of String, Number, Boolean, Array, Object, Function. A
 * default is a template expression compiled once and run with an empty scope
 * at every mount, so `items: Array = []` hands each instance its own array.
 *
 * The runtime still warns when a parent passes a b-logic key that is not
 * declared, and when a declared prop resolves to undefined with no default.
 *
 * This module owns the per-tag registry of declared props. Call sites go
 * through register / unregister / get / validate and the apply helpers.
 */

const TYPES = ['String', 'Number', 'Boolean', 'Array', 'Object', 'Function'];

// name, then an optional `: Type`, then an optional `= default expression`.
const DECL = /^([a-zA-Z_$][\w$]*)\s*(?::\s*([A-Za-z]+))?\s*(?:=\s*([\s\S]+))?$/;

const declared = new Map(); // tagName -> Array<{name, type, defaultFn, attr}>

/**
 * Split on commas that are not inside a string, a call, an array or an object
 * literal, so `items = [1, 2]` stays one declaration.
 */
const splitDeclarations = (body) => {
  const out = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch !== ',' || depth !== 0) continue;
    out.push(body.slice(start, i));
    start = i + 1;
  }
  out.push(body.slice(start));
  return out.map(t => t.trim()).filter(Boolean);
};

/**
 * Compile a default expression into a thunk. Each call gets a fresh scope so
 * an object or array literal produces a new value per instance rather than
 * one shared between every mount of the block.
 */
const compileDefault = (src, tagName, name) => {
  if (!src) return null;
  const blame = (e) => console.error(`[Lego] <${tagName}> prop "${name}" default "${src}":`, e.message);
  let fn;
  try {
    fn = compile(src);
  } catch (e) {
    blame(e);
    return null;
  }
  return () => {
    try {
      return fn({}, {});
    } catch (e) {
      blame(e);
      return undefined;
    }
  };
};

const parse = (raw, tagName = '<unknown>') => {
  if (!raw || typeof raw !== 'string') return null;
  let body = raw.trim();
  if (!body) return null;

  if (body.startsWith('{') && body.endsWith('}')) {
    body = body.slice(1, -1).trim();
    if (!body) return null;
  }

  const tokens = splitDeclarations(body);
  if (tokens.length === 0) return null;

  const out = [];
  for (const tok of tokens) {
    const match = DECL.exec(tok);
    const type = match && match[2];
    if (!match || (type && !TYPES.includes(type))) {
      console.error(
        `[Lego] Invalid b-props on <${tagName}>: "${tok}" is not a valid prop declaration. ` +
        `Write name, name: Type, or either with = default, where Type is one of ${TYPES}.`
      );
      return null;
    }
    out.push({
      name: match[1],
      type: type || null,
      defaultFn: compileDefault(match[3], tagName, match[1]),
      attr: kebabCase(match[1])
    });
  }
  return out;
};

/**
 * Turn a plain HTML attribute value into the declared type. `raw` is null
 * when the attribute was removed, which only means anything for Boolean.
 * An Array or Object attribute that is not JSON returns undefined, which
 * every caller reads as "leave the prop alone".
 */
const coerceValue = (prop, raw, tagName) => {
  if (prop.type === 'Number') return Number(raw);
  if (prop.type === 'Boolean') return raw !== null && raw !== 'false';
  if (prop.type !== 'Array' && prop.type !== 'Object') return raw;
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`[Lego] <${tagName}> attribute "${prop.attr}" is not JSON: ${raw}`);
    return undefined;
  }
};

export const bProps = {
  /**
   * Register (or replace) the prop contract for a tag from a raw attribute string.
   * Pass falsy `raw` to clear any existing contract for the tag.
   */
  register(tagName, raw) {
    if (!raw) {
      declared.delete(tagName);
      return;
    }
    const parsed = parse(raw, tagName);
    if (parsed) declared.set(tagName, parsed);
    else declared.delete(tagName);
  },

  unregister(tagName) {
    declared.delete(tagName);
  },

  /** The declared prop descriptors for a tag, or null. */
  get(tagName) {
    return declared.get(tagName) || null;
  },

  /** Kebab-cased attribute names, the value for `observedAttributes`. */
  attrs(tagName) {
    const list = declared.get(tagName);
    return list ? list.map(p => p.attr) : [];
  },

  /** Fill in declared defaults for props that nothing else provided. */
  applyDefaults(tagName, state) {
    const list = declared.get(tagName);
    if (!list) return;
    list.forEach(prop => {
      if (state[prop.name] !== undefined) return;
      // A declared prop always exists on state so a template can read it
      // without a ReferenceError. Booleans follow attribute semantics: absent
      // means false.
      if (prop.defaultFn) {
        state[prop.name] = prop.defaultFn();
        return;
      }
      state[prop.name] = prop.type === 'Boolean' ? false : undefined;
    });
  },

  /** Copy every plain attribute matching a declared prop onto `state`. */
  applyAttributes(el, tagName, state) {
    const list = declared.get(tagName);
    if (!list) return;
    list.forEach(prop => {
      if (!el.hasAttribute(prop.attr)) return;
      const value = coerceValue(prop, el.getAttribute(prop.attr), tagName);
      if (value !== undefined) state[prop.name] = value;
    });
  },

  /**
   * Reflect one attribute change onto a mounted block. Removing a non-Boolean
   * attribute leaves the current value alone: there is no string to coerce,
   * and clobbering the prop with '' would be worse than doing nothing.
   */
  applyAttribute(el, tagName, attrName) {
    const list = declared.get(tagName);
    const prop = list && list.find(p => p.attr === attrName);
    if (!prop || !el._studs) return;
    const raw = el.getAttribute(attrName);
    if (raw === null && prop.type !== 'Boolean') return;
    const value = coerceValue(prop, raw, tagName);
    if (value !== undefined) el._studs[prop.name] = value;
  },

  /**
   * Dev-warn for missing required props and unknown b-logic keys.
   * No-op if the tag has no declared b-props.
   */
  validate({ instanceLogic, state, tagName }) {
    const list = declared.get(tagName);
    if (!list) return;

    if (instanceLogic) {
      for (const key of Object.keys(instanceLogic)) {
        if (!list.some(p => p.name === key)) {
          console.warn(
            `[Lego] <${tagName}> received b-logic key "${key}" not declared in b-props. ` +
            `Declared: { ${list.map(p => p.name).join(', ')} }.`
          );
        }
      }
    }

    for (const prop of list) {
      if (prop.defaultFn) continue;
      if (state[prop.name] === undefined) {
        console.warn(
          `[Lego] <${tagName}> is missing prop "${prop.name}" (declared in b-props but not provided).`
        );
      }
    }
  }
};
