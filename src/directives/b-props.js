/**
 * b-props — declarative prop contract for blocks.
 *
 * Pure metadata. Does NOT introduce a new data channel: parents still pass
 * values via b-logic exactly as before. Declaring b-props on a <template>
 * lets tooling (devtools, vscode-lego, type codegen) see which keys a block
 * accepts from its parent, and lets the runtime warn when:
 *   1. a parent passes a b-logic key not declared in b-props (typo guard)
 *   2. a declared name resolves to undefined after merge (missing prop)
 *
 * Syntax — identifier lists, brace-optional, comma-separated:
 *   b-props="{ age, name, dateOfBirth }"
 *   b-props="age, name, dateOfBirth"
 *
 * Anything that is not a bare identifier list (e.g. `{ name: 'Alice' }` or
 * `{ name = 'x' }`) is rejected at parse time. Use b-logic for values.
 *
 * This module is fully self-contained: it owns the per-tag registry of
 * declared props. Call sites delegate via register/unregister/validate.
 */

const IDENT = /^[a-zA-Z_$][\w$]*$/;
const declared = new Map(); // tagName -> string[]

const parse = (raw, tagName = '<unknown>') => {
  if (!raw || typeof raw !== 'string') return null;
  let body = raw.trim();
  if (!body) return null;

  if (body.startsWith('{') && body.endsWith('}')) {
    body = body.slice(1, -1).trim();
    if (!body) return null;
  }

  const tokens = body.split(',').map(t => t.trim()).filter(Boolean);
  if (tokens.length === 0) return null;

  const out = [];
  for (const tok of tokens) {
    if (!IDENT.test(tok)) {
      console.error(
        `[Lego] Invalid b-props on <${tagName}>: token "${tok}" is not a bare identifier. ` +
        `b-props declares names only — use b-logic for values. Got: "${raw}"`
      );
      return null;
    }
    out.push(tok);
  }
  return out;
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

  /** Internal-ish: read the declared list for a tag (used by tooling/tests). */
  get(tagName) {
    return declared.get(tagName) || null;
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
        if (!list.includes(key)) {
          console.warn(
            `[Lego] <${tagName}> received b-logic key "${key}" not declared in b-props. ` +
            `Declared: { ${list.join(', ')} }.`
          );
        }
      }
    }

    for (const name of list) {
      if (state[name] === undefined) {
        console.warn(
          `[Lego] <${tagName}> is missing prop "${name}" (declared in b-props but not provided).`
        );
      }
    }
  }
};
