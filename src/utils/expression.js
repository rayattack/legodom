/**
 * Template expression compiler.
 *
 * Replaces the old `new Function(...)` + `with()` evaluator. Source text is
 * tokenized, parsed with a precedence climbing (Pratt style) parser, and
 * compiled into a tree of closures. No template text is ever handed back to
 * the JS engine as source, so:
 *
 *   1. templates run under a CSP without `unsafe-eval`,
 *   2. identifier resolution is entirely ours (no reachable real globals),
 *   3. no sloppy-mode `with()` deopt,
 *   4. the old bypassable regex blocklist is gone.
 *
 * This module is pure: no DOM access, no imports from core/ or features/.
 */
import { LRUCache } from './lru-cache.js';

// Same budget the old expression cache used. Compiled closures are small and
// bounded by the number of distinct expression sources on a page.
const CACHE_LIMIT = 1000;
const cache = new LRUCache(CACHE_LIMIT);

const dict = (obj) => Object.assign(Object.create(null), obj);

/* ------------------------------------------------------------------ *
 * Sandbox tables
 * ------------------------------------------------------------------ */

/**
 * The only globals a template expression can name. Everything else (window,
 * document, globalThis, fetch, Function, eval, localStorage, location,
 * navigator, setTimeout, ...) is simply not in scope, so naming it raises a
 * ReferenceError instead of reaching the host page.
 */
const SAFE = dict({
  Math, JSON, Date, Number, String, Boolean, Array, Object,
  parseInt, parseFloat, isNaN, isFinite,
  encodeURIComponent, decodeURIComponent, encodeURI, decodeURI,
  console, Intl, Promise, Set, Map, RegExp, NaN, Infinity, undefined
});

/** Values injected by the caller, addressable by these fixed names. */
const NAMED = dict({
  global: 'global', self: 'self', event: 'event', $event: 'event', helpers: 'helpers'
});

/**
 * Property names that need a look before they are handed back.
 *
 * `__proto__` and the four reflection helpers are denied outright: the
 * helpers only exist here because `Object` is allowlisted, and
 * `Object.getPrototypeOf(x).y = 1` would otherwise pollute every object on
 * the page (audit fix #41).
 *
 * `constructor` and `prototype` are denied by VALUE, not by name, because
 * both are realistic data fields (a building record's `constructor`, a
 * schema's `prototype`). A read is denied only when it would hand back a
 * function, or when the receiver is itself a function. That still blocks
 * `{}.constructor`, `[].constructor`, `Object.prototype`, `fn.constructor`
 * and the whole `obj.constructor.constructor("...")()` chain, since every
 * link in those yields a function. Writes to all three stay denied
 * unconditionally: there is no safe reason for a template to set them.
 */
const DENIED = new Set(
  '__proto__ getPrototypeOf setPrototypeOf defineProperty getOwnPropertyDescriptor constructor prototype'.split(' ')
);

/**
 * Thrown when a template touches a denied property. Carries a `denied` flag
 * so safe-eval.js can warn and yield `undefined` rather than propagate.
 */
const deny = (name) => {
  const err = new Error(`[Lego] Denied access to "${name}"`);
  err.denied = name;
  throw err;
};

/** Computed keys are compared after ToString so `a[['__proto__']]` is caught. */
const norm = (key) => (key !== null && typeof key === 'object') ? String(key) : key;

/**
 * Key check for object literals. A literal builds a brand-new object, so a
 * key named `constructor` or `prototype` only creates an own data property
 * (`b-logic="{ constructor: 'Bechtel' }"` is legitimate). `__proto__` is the
 * exception: assigning it on a fresh object swaps that object's prototype,
 * so it stays denied.
 */
const literalKey = (key) => {
  const k = norm(key);
  if (k === '__proto__') deny(k);
  return k;
};

/* ------------------------------------------------------------------ *
 * Scope resolution
 * ------------------------------------------------------------------ */

/**
 * Identifier lookup order: helpers, scope, caller extras, named context
 * values, allowlisted globals. Helpers win over state because the old
 * evaluator nested `with(helpers)` inside `with(state)`.
 *
 * Reads go through `name in scope` / `scope[name]` on purpose: `in` walks the
 * prototype chain so `Object.create(state)` loop scopes resolve, and the
 * property read is what the reactive proxy's `get` trap observes. Never cache
 * or destructure scope values here.
 */
const readId = (name, scope, ctx) => {
  const helpers = ctx.helpers;
  if (helpers && name in helpers) return readProp(helpers, name);
  if (scope && name in scope) return readProp(scope, name);
  const extra = ctx.extra;
  if (extra && name in extra) return readProp(extra, name);
  if (name in NAMED) return ctx[NAMED[name]];
  if (name in SAFE) return SAFE[name];
  throw new ReferenceError(`${name} is not defined`);
};

/**
 * Writes prefer an existing scope key, refuse to clobber helpers or context
 * values, and otherwise create the key on scope. The old sloppy-mode `with`
 * leaked such assignments onto the real global object instead.
 */
const writeId = (name, scope, ctx, value) => {
  if (DENIED.has(name)) deny(name);
  if (scope && name in scope) {
    scope[name] = value;
    return value;
  }
  const helpers = ctx.helpers;
  const shadowed = (helpers && name in helpers) || name in NAMED ||
    (ctx.extra && name in ctx.extra);
  if (shadowed) throw new TypeError(`[Lego] Cannot assign to "${name}"`);
  if (scope) scope[name] = value;
  return value;
};

const readProp = (obj, key) => {
  const k = norm(key);
  if (!DENIED.has(k)) return obj[k];
  // Cold path: `constructor` and `prototype` are allowed through when they
  // hold data rather than a function (and the receiver is not itself one).
  const value = obj[k];
  const dataField = (k === 'constructor' || k === 'prototype') &&
    typeof obj !== 'function' && typeof value !== 'function';
  if (!dataField) deny(k);
  return value;
};

const writeProp = (obj, key, value) => {
  const k = norm(key);
  if (DENIED.has(k)) deny(k);
  obj[k] = value;
  return value;
};

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

const ESC_NAMES = 'nrtbfv0';
const ESC_VALUES = '\n\r\t\b\f\v\0';
/** `\n` and friends; anything else after a backslash is itself. */
const unescape = (c) => {
  const at = ESC_NAMES.indexOf(c);
  return at < 0 ? c : ESC_VALUES[at];
};

/**
 * One sticky regex covers whitespace, numbers, identifiers and punctuators.
 * Alternatives are ordered longest first so `===` wins over `==` over `=`.
 * Quoted strings and template literals need their own scanners (escapes and
 * nested `${}`), so tokenize() peels those off before running this.
 */
const TOKEN_RE = new RegExp([
  '\\s+',
  '(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?|\\.\\d+)',
  '([A-Za-z_$][\\w$]*)',
  '(===|!==|=>|[=!<>]=|&&|\\|\\||\\?\\?|\\?\\.|\\+\\+|--|[-+*/]=|\\*\\*|[-+*/%!<>?:.,()[\\]{}=])'
].join('|'), 'y');

const UNTERMINATED = 'Unterminated literal';

const syntaxError = (msg, at, src) =>
  new SyntaxError(`[Lego] ${msg} at position ${at} in expression: ${src}`);

function readString(src, start) {
  const quote = src[start];
  let out = '';
  let i = start + 1;
  while (i < src.length && src[i] !== quote) {
    if (src[i] !== '\\') {
      out += src[i++];
      continue;
    }
    out += unescape(src[i + 1]);
    i += 2;
  }
  if (i >= src.length) throw syntaxError(UNTERMINATED, start, src);
  return [out, i + 1];
}

/** Index of the `}` closing a `${` that opened at `start`. */
function closingBrace(src, start) {
  let depth = 1;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = readString(src, i)[1];
      continue;
    }
    if (c === '`') {
      i = readTemplate(src, i)[1];
      continue;
    }
    if (c === '{') depth++;
    else if (c === '}' && !--depth) return i;
    i++;
  }
  throw syntaxError(UNTERMINATED, start, src);
}

/** Returns [{ qs, xs }, nextIndex]: literal chunks and raw `${}` sources. */
function readTemplate(src, start) {
  const qs = [];
  const xs = [];
  let chunk = '';
  let i = start + 1;
  while (i < src.length && src[i] !== '`') {
    if (src[i] === '\\') {
      chunk += unescape(src[i + 1]);
      i += 2;
      continue;
    }
    if (src[i] === '$' && src[i + 1] === '{') {
      const end = closingBrace(src, i + 2);
      xs.push(src.slice(i + 2, end));
      qs.push(chunk);
      chunk = '';
      i = end + 1;
      continue;
    }
    chunk += src[i++];
  }
  if (i >= src.length) throw syntaxError(UNTERMINATED, start, src);
  qs.push(chunk);
  return [{ qs, xs }, i + 1];
}

/**
 * Token shape: { t, v, i } where `t` is one of
 * 'n' number, 's' string, 't' template, 'i' identifier, 'p' punctuator, 'e' end.
 */
export const tokenize = (src) => {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      const quoted = c === '`';
      const [value, next] = quoted ? readTemplate(src, i) : readString(src, i);
      out.push({ t: quoted ? 't' : 's', v: value, i });
      i = next;
      continue;
    }
    TOKEN_RE.lastIndex = i;
    const m = TOKEN_RE.exec(src);
    if (!m) throw syntaxError(`Unexpected character "${c}"`, i, src);
    const [all, num, name, punct] = m;
    if (num !== undefined) {
      out.push({ t: 'n', v: Number(num), i });
    } else if (name !== undefined) {
      out.push({ t: 'i', v: name, i });
    } else if (punct !== undefined) {
      out.push({ t: 'p', v: punct, i });
    }
    i += all.length;
  }
  out.push({ t: 'e', v: '', i });
  return out;
};

/* ------------------------------------------------------------------ *
 * Parser
 * ------------------------------------------------------------------ */

// Binary operator groups, lowest precedence first. Derived indexes keep the
// table free of hand-written precedence numbers.
const BIN_GROUPS = ['??', '||', '&&', '== != === !==', '< > <= >= in', '+ -', '* / %', '**'];
const PREC = dict({});
BIN_GROUPS.forEach((group, index) => {
  group.split(' ').forEach(op => { PREC[op] = index + 1; });
});
const LOGICAL_MAX_PREC = PREC['&&'];

const ASSIGN_OPS = new Set('= += -= *= /='.split(' '));
const UNARY_OPS = dict({ '!': v => !v, '-': v => -v, '+': v => +v });
const KEYWORDS = dict({ true: true, false: false, null: null, undefined: undefined });

let toks = null;
let pos = 0;
let text = '';

const fail = () => {
  const t = toks[pos];
  throw syntaxError(
    t.t === 'e' ? 'Unexpected end of input' : `Unexpected token "${t.v}"`,
    t.i,
    text
  );
};

const isPunct = (v) => {
  const t = toks[pos];
  return t.t === 'p' && t.v === v;
};

const eat = (v) => {
  if (!isPunct(v)) return false;
  pos++;
  return true;
};

const expect = (v) => {
  if (!eat(v)) fail();
};

const identName = () => {
  const t = toks[pos];
  if (t.t !== 'i') fail();
  pos++;
  return t.v;
};

const assignable = (node) => {
  if (node.k !== 'Id' && node.k !== 'Mem') fail();
  return node;
};

/** Comma-separated items up to `close`, allowing a trailing comma. */
const parseList = (close, item) => {
  const out = [];
  if (eat(close)) return out;
  do {
    if (isPunct(close)) break;
    out.push(item());
  } while (eat(','));
  expect(close);
  return out;
};

const parseArgs = () => parseList(')', parseAssign);

const parseProp = () => {
  if (eat('[')) {
    const key = parseAssign();
    expect(']');
    expect(':');
    return { c: true, k: key, v: parseAssign() };
  }
  const t = toks[pos];
  if (t.t !== 'i' && t.t !== 's' && t.t !== 'n') fail();
  pos++;
  const name = String(t.v);
  if (eat(':')) return { c: false, k: name, v: parseAssign() };
  // Shorthand `{ a }`. Method shorthand `{ a() {...} }` has a statement body
  // and is deliberately unsupported, so it falls through to fail().
  if (t.t === 'i' && (isPunct(',') || isPunct('}'))) {
    return { c: false, k: name, v: { k: 'Id', n: name } };
  }
  return fail();
};

const parseArrow = (params) => {
  expect('=>');
  return { k: 'Arw', ps: params, b: parseAssign() };
};

/** Re-reads an already-parsed `(a, b)` as an arrow parameter list. */
const paramNames = (node) => {
  if (node.k === 'Id') return [node.n];
  if (node.k !== 'Seq') fail();
  return paramNames(node.a).concat(paramNames(node.b));
};

const parseName = () => {
  const name = identName();
  if (isPunct('=>')) return parseArrow([name]);
  if (name === 'this') return { k: 'This' };
  if (name in KEYWORDS) return { k: 'Lit', v: KEYWORDS[name] };
  return { k: 'Id', n: name };
};

const parsePrimary = () => {
  const t = toks[pos];
  if (t.t === 'n' || t.t === 's') {
    pos++;
    return { k: 'Lit', v: t.v };
  }
  if (t.t === 't') {
    pos++;
    return { k: 'Tpl', qs: t.v.qs, xs: t.v.xs.map(src => parse(src)) };
  }
  if (t.t === 'i') return parseName();
  if (eat('(')) {
    // Cover grammar: `(a, b)` is a parenthesized sequence or an arrow
    // parameter list, and only the token after `)` says which.
    if (eat(')')) return parseArrow([]);
    const inner = parseSequence();
    expect(')');
    return isPunct('=>') ? parseArrow(paramNames(inner)) : inner;
  }
  if (eat('[')) return { k: 'Arr', es: parseList(']', parseAssign) };
  if (eat('{')) return { k: 'Obj', ps: parseList('}', parseProp) };
  return fail();
};

/**
 * `new X(...)` / `new a.b.X(...)`. The callee can only resolve through scope,
 * helpers or the SAFE allowlist, and Function is not reachable from any of
 * them, so construction needs no guard of its own.
 */
const parseHead = () => {
  const t = toks[pos];
  if (t.t !== 'i' || t.v !== 'new') return parsePrimary();
  pos++;
  let callee = parsePrimary();
  while (eat('.')) callee = { k: 'Mem', o: callee, pr: identName(), c: false };
  return { k: 'New', f: callee, a: eat('(') ? parseArgs() : [] };
};

const parseSubject = () => {
  let node = parseHead();
  let optional = false;
  for (;;) {
    // `?.` only marks the link that follows it, so it shares the three link
    // forms: `?.name`, `?.[expr]` and `?.(args)`.
    const opt = eat('?.');
    if (opt) optional = true;
    if (eat('[')) {
      const key = parseSequence();
      expect(']');
      node = { k: 'Mem', o: node, pr: key, c: true, opt };
      continue;
    }
    if (eat('(')) {
      node = { k: 'Call', f: node, a: parseArgs(), opt };
      continue;
    }
    if (!opt && !eat('.')) break;
    node = { k: 'Mem', o: node, pr: identName(), c: false, opt };
  }
  // A chain containing an optional link short-circuits as a whole, so wrap it
  // and turn the internal sentinel back into `undefined` at the boundary.
  return optional ? { k: 'Chain', a: node } : node;
};

const parseUnary = () => {
  const t = toks[pos];
  if (t.t === 'p' && UNARY_OPS[t.v]) {
    pos++;
    return { k: 'Un', o: t.v, a: parseUnary() };
  }
  if (t.t === 'p' && (t.v === '++' || t.v === '--')) {
    // Prefix is exactly a compound assignment: ++a is a += 1, and both yield
    // the new value. Only postfix needs its own node.
    pos++;
    return { k: 'Asg', o: `${t.v[0]}=`, a: assignable(parseUnary()), b: { k: 'Lit', v: 1 } };
  }
  if (t.t === 'i' && t.v === 'typeof') {
    pos++;
    return { k: 'Un', o: 'typeof', a: parseUnary() };
  }
  const node = parseSubject();
  const next = toks[pos];
  if (next.t === 'p' && (next.v === '++' || next.v === '--')) {
    pos++;
    return { k: 'Upd', o: next.v, a: assignable(node) };
  }
  return node;
};

// Deliberately more permissive than the JS grammar: real JS rejects `a ?? b || c`
// unless one side is parenthesized. Here the precedence table already gives `??`
// the loosest binding, so the expression parses as `a ?? (b || c)` instead of
// being a syntax error. Accepting it costs nothing and misleads no one.
const parseBinary = (min) => {
  let left = parseUnary();
  for (;;) {
    const t = toks[pos];
    const op = (t.t === 'p' || (t.t === 'i' && t.v === 'in')) ? t.v : null;
    const prec = op ? PREC[op] : undefined;
    if (!prec || prec < min) return left;
    pos++;
    const right = parseBinary(op === '**' ? prec : prec + 1); // ** is right associative
    left = { k: prec <= LOGICAL_MAX_PREC ? 'Log' : 'Bin', o: op, a: left, b: right };
  }
};

const parseConditional = () => {
  const test = parseBinary(1);
  if (!eat('?')) return test;
  const consequent = parseAssign();
  expect(':');
  return { k: 'Cond', t: test, a: consequent, b: parseAssign() };
};

function parseAssign() {
  const left = parseConditional();
  const t = toks[pos];
  if (t.t !== 'p' || !ASSIGN_OPS.has(t.v)) return left;
  pos++;
  assignable(left);
  return { k: 'Asg', o: t.v, a: left, b: parseAssign() };
}

function parseSequence() {
  let node = parseAssign();
  while (eat(',')) node = { k: 'Seq', a: node, b: parseAssign() };
  return node;
}

/**
 * Parse an expression source into an AST. Reentrant: template literal
 * placeholders are parsed recursively, so parser state is saved and restored.
 */
export function parse(src) {
  const saved = [toks, pos, text];
  try {
    toks = tokenize(src);
    pos = 0;
    text = src;
    if (toks[0].t === 'e') return { k: 'Lit', v: undefined };
    const node = parseSequence();
    if (toks[pos].t !== 'e') fail();
    return node;
  } finally {
    [toks, pos, text] = saved;
  }
}

/* ------------------------------------------------------------------ *
 * Compiler: AST to closures
 * ------------------------------------------------------------------ */

const BIN = dict({
  '+': (a, b) => a + b,
  '-': (a, b) => a - b,
  '*': (a, b) => a * b,
  '/': (a, b) => a / b,
  '%': (a, b) => a % b,
  '**': (a, b) => a ** b,
  '==': (a, b) => a == b, // eslint-disable-line eqeqeq
  '!=': (a, b) => a != b, // eslint-disable-line eqeqeq
  '===': (a, b) => a === b,
  '!==': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '>': (a, b) => a > b,
  '<=': (a, b) => a <= b,
  '>=': (a, b) => a >= b,
  in: (a, b) => a in b
});

/** Sentinel threaded through an optional chain that short-circuited. */
const SHORT = {};

/**
 * Receiver of the most recently evaluated member read. A method call reads it
 * immediately after evaluating its callee and before evaluating any argument,
 * so nested calls cannot race it.
 */
let lastBase;

const genMember = (n) => {
  const obj = gen(n.o);
  const opt = n.opt;
  const keyFn = n.c ? gen(n.pr) : null;
  const key = n.pr;
  return (s, c) => {
    const base = obj(s, c);
    lastBase = base;
    if (base === SHORT || (opt && base == null)) return SHORT;
    return readProp(base, keyFn ? keyFn(s, c) : key);
  };
};

const genCall = (n) => {
  const argFns = n.a.map(gen);
  const fnOf = gen(n.f);
  // A method keeps its receiver; a bare identifier call runs with
  // `this === scope`, matching what `with(this) { foo() }` did for state methods.
  const method = n.f.k === 'Mem';
  return (s, c) => {
    const fn = fnOf(s, c);
    const base = method ? lastBase : s;
    if (fn === SHORT) return SHORT;
    if (n.opt && fn == null) return SHORT;
    return fn.apply(base, argFns.map(f => f(s, c)));
  };
};

const genNew = (n) => {
  const fnOf = gen(n.f);
  const argFns = n.a.map(gen);
  return (s, c) => new (fnOf(s, c))(...argFns.map(f => f(s, c)));
};

const genRef = (n) => {
  if (n.k === 'Id') {
    const name = n.n;
    return {
      get: (s, c) => readId(name, s, c),
      set: (s, c, v) => writeId(name, s, c, v)
    };
  }
  const obj = gen(n.o);
  const keyFn = n.c ? gen(n.pr) : () => n.pr;
  return {
    get: (s, c) => readProp(obj(s, c), keyFn(s, c)),
    set: (s, c, v) => writeProp(obj(s, c), keyFn(s, c), v)
  };
};

const genAssign = (n) => {
  const ref = genRef(n.a);
  const value = gen(n.b);
  if (n.o === '=') return (s, c) => ref.set(s, c, value(s, c));
  const apply = BIN[n.o[0]]; // '+=' uses '+', and so on
  return (s, c) => ref.set(s, c, apply(ref.get(s, c), value(s, c)));
};

/** Postfix only: prefix ++/-- is parsed as a compound assignment. */
const genUpdate = (n) => {
  const ref = genRef(n.a);
  const delta = n.o === '++' ? 1 : -1;
  return (s, c) => {
    const before = Number(ref.get(s, c));
    ref.set(s, c, before + delta);
    return before;
  };
};

// defineProperty copies the descriptor immediately, so one shared object is
// safe here and saves an allocation per parameter per call.
const PARAM_DESC = { value: undefined, writable: true, configurable: true };

const genArrow = (n) => {
  const body = gen(n.b);
  const params = n.ps;
  return (s, c) => function (...args) {
    // Object.create keeps the parent scope reachable through the prototype
    // chain; defineProperty (not assignment) keeps a param whose name also
    // exists on state from writing through to state.
    const frame = Object.create(s || null);
    params.forEach((p, i) => {
      PARAM_DESC.value = args[i];
      Object.defineProperty(frame, p, PARAM_DESC);
    });
    return body(frame, c);
  };
};

const genObject = (n) => {
  const props = n.ps.map(p => ({ c: p.c, k: p.c ? gen(p.k) : literalKey(p.k), v: gen(p.v) }));
  return (s, c) => {
    const out = {};
    props.forEach(p => { out[p.c ? literalKey(p.k(s, c)) : p.k] = p.v(s, c); });
    return out;
  };
};

const genTemplate = (n) => {
  const chunks = n.qs;
  const parts = n.xs.map(gen);
  return (s, c) => {
    let out = chunks[0];
    for (let i = 0; i < parts.length; i++) out += parts[i](s, c) + chunks[i + 1];
    return out;
  };
};

const genUnary = (n) => {
  const operand = gen(n.a);
  if (n.o !== 'typeof') {
    const apply = UNARY_OPS[n.o];
    return (s, c) => apply(operand(s, c));
  }
  // `typeof undeclared` must not throw, so `typeof window` yields 'undefined'.
  return (s, c) => {
    try {
      return typeof operand(s, c);
    } catch (e) {
      if (e instanceof ReferenceError) return 'undefined';
      throw e;
    }
  };
};

const genLogical = (n) => {
  const a = gen(n.a);
  const b = gen(n.b);
  if (n.o === '&&') return (s, c) => a(s, c) && b(s, c);
  if (n.o === '||') return (s, c) => a(s, c) || b(s, c);
  return (s, c) => a(s, c) ?? b(s, c);
};

const GEN = dict({
  Lit: (n) => () => n.v,
  Id: (n) => (s, c) => readId(n.n, s, c),
  This: () => (s) => s,
  Mem: genMember,
  Call: genCall,
  New: genNew,
  Un: genUnary,
  Log: genLogical,
  Asg: genAssign,
  Upd: genUpdate,
  Arw: genArrow,
  Obj: genObject,
  Tpl: genTemplate,
  Chain: (n) => {
    const inner = gen(n.a);
    return (s, c) => {
      const v = inner(s, c);
      return v === SHORT ? undefined : v;
    };
  },
  Arr: (n) => {
    const items = n.es.map(gen);
    return (s, c) => items.map(f => f(s, c));
  },
  Cond: (n) => {
    const test = gen(n.t);
    const a = gen(n.a);
    const b = gen(n.b);
    return (s, c) => (test(s, c) ? a(s, c) : b(s, c));
  },
  Bin: (n) => {
    const apply = BIN[n.o];
    const a = gen(n.a);
    const b = gen(n.b);
    return (s, c) => apply(a(s, c), b(s, c));
  },
  Seq: (n) => {
    const first = gen(n.a);
    const last = gen(n.b);
    return (s, c) => {
      first(s, c);
      return last(s, c);
    };
  }
});

function gen(n) {
  return GEN[n.k](n);
}

/**
 * Compile an expression source into `(scope, ctx) => value`.
 *
 * `ctx` may carry `helpers`, `global`, `self`, `event` and `extra` (an extra
 * lookup object consulted right after scope, used by b-logic parsing).
 * Compiled closures are cached by source string.
 */
export const compile = (src) => {
  let fn = cache.get(src);
  if (fn) return fn;
  try {
    fn = gen(parse(src));
  } catch (e) {
    // A denied name in an object literal key is decided at compile time. Cache
    // a closure that re-throws it so callers keep their per-evaluation warning
    // without re-tokenizing and re-parsing the source on every render. Syntax
    // errors are not cached: parseJSObject needs the throw to pick its
    // fallback, and a typo is not worth a cache slot.
    if (!e || !e.denied) throw e;
    fn = () => { throw e; };
  }
  cache.set(src, fn);
  return fn;
};
