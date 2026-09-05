import { describe, it, expect } from 'vitest';
import { tokenize, parse, compile } from '../src/utils/expression.js';

// Pure unit tests: no JSDOM, no bundle. These exercise src/utils/expression.js
// directly, so they run in milliseconds.

const ctx = (over = {}) => ({
  helpers: null,
  global: {},
  self: null,
  event: undefined,
  ...over
});

const run = (src, scope = {}, over = {}) => compile(src)(scope, ctx(over));

describe('tokenize', () => {
  it('splits identifiers, numbers, strings and punctuators', () => {
    // i identifier, p punctuator, n number, s string, e end of input
    const kinds = tokenize("a.b + 1 * 'x'").map(t => t.t).join('');
    expect(kinds).toBe('ipipnpse');
  });

  it('records the source offset of every token', () => {
    const toks = tokenize('a + b');
    expect(toks.map(t => t.i)).toEqual([0, 2, 4, 5]);
  });
});

describe('literals', () => {
  it('evaluates numbers, floats and exponents', () => {
    expect(run('42')).toBe(42);
    expect(run('3.5')).toBe(3.5);
    expect(run('.5')).toBe(0.5);
    expect(run('2e3')).toBe(2000);
  });

  it('evaluates quoted strings with escapes', () => {
    expect(run('"hi"')).toBe('hi');
    expect(run("'it\\'s'")).toBe("it's");
    expect(run("'a\\nb'")).toBe('a\nb');
  });

  it('evaluates the reserved words', () => {
    expect(run('true')).toBe(true);
    expect(run('false')).toBe(false);
    expect(run('null')).toBe(null);
    expect(run('undefined')).toBe(undefined);
  });

  it('evaluates an empty expression as undefined', () => {
    expect(run('')).toBe(undefined);
    expect(run('   ')).toBe(undefined);
  });

  it('evaluates array and object literals', () => {
    expect(run('[1, 2, 3]')).toEqual([1, 2, 3]);
    expect(run("{ a: 1, 'b': 2, c }", { c: 3 })).toEqual({ a: 1, b: 2, c: 3 });
    expect(run('{ [key]: 1 }', { key: 'dyn' })).toEqual({ dyn: 1 });
  });

  it('evaluates template literals with placeholders', () => {
    expect(run('`${tab}-pane`', { tab: 'users' })).toBe('users-pane');
    expect(run('`a${1 + 1}b${"c"}`')).toBe('a2bc');
    expect(run('`nested ${ `${x}` }`', { x: 'y' })).toBe('nested y');
  });
});

describe('operators and precedence', () => {
  it('follows arithmetic precedence', () => {
    expect(run('1 + 2 * 3')).toBe(7);
    expect(run('(1 + 2) * 3')).toBe(9);
    expect(run('7 % 4')).toBe(3);
  });

  it('treats ** as right associative', () => {
    expect(run('2 ** 3 ** 2')).toBe(512);
    expect(run('(2 ** 3) ** 2')).toBe(64);
  });

  it('orders comparison below equality and above logical operators', () => {
    expect(run('1 < 2 === true')).toBe(true);
    expect(run('1 > 2 || 3 > 2')).toBe(true);
    expect(run('0 && 1 || 2')).toBe(2);
    expect(run("'a' in obj", { obj: { a: 1 } })).toBe(true);
  });

  it('applies unary operators', () => {
    expect(run('!ok', { ok: false })).toBe(true);
    expect(run('-n', { n: 5 })).toBe(-5);
    expect(run("+'2'")).toBe(2);
    expect(run('typeof n', { n: 5 })).toBe('number');
  });

  it('short-circuits ?? on nullish only', () => {
    expect(run('a ?? "fallback"', { a: null })).toBe('fallback');
    expect(run('a ?? "fallback"', { a: 0 })).toBe(0);
    expect(run('(a ?? b) || c', { a: null, b: 0, c: 'c' })).toBe('c');
    expect(run('a ?? (b || c)', { a: null, b: 0, c: 'c' })).toBe('c');
  });

  it('accepts ?? mixed with || or && (more permissive than the JS grammar)', () => {
    // JS demands parentheses here. The precedence table already binds ?? the
    // loosest, so we parse rather than reject: `a ?? (b || c)`.
    expect(run('a ?? b || c', { a: null, b: 0, c: 'c' })).toBe('c');
    expect(run('a ?? b || c', { a: 'a', b: 0, c: 'c' })).toBe('a');
    expect(run('a || b ?? c', { a: 0, b: null, c: 'c' })).toBe('c');
  });

  it('evaluates ternaries', () => {
    expect(run("flag ? 'on' : 'off'", { flag: true })).toBe('on');
    expect(run("item.active ? 'active' : ''", { item: { active: false } })).toBe('');
  });

  it('evaluates a parenthesized sequence', () => {
    const scope = { a: 0 };
    expect(run('(a = 1, a + 1)', scope)).toBe(2);
    expect(scope.a).toBe(1);
  });
});

describe('member access and calls', () => {
  it('reads static and computed members', () => {
    expect(run('user.name', { user: { name: 'Ada' } })).toBe('Ada');
    expect(run('items[1]', { items: ['a', 'b'] })).toBe('b');
    expect(run('items[i].id', { items: [{ id: 7 }], i: 0 })).toBe(7);
  });

  it('short-circuits a whole optional chain on null', () => {
    expect(run('user?.role', { user: null })).toBe(undefined);
    expect(run('user?.profile.role', { user: null })).toBe(undefined);
    expect(run('user?.["role"]', { user: null })).toBe(undefined);
    expect(run('user?.()', { user: null })).toBe(undefined);
    expect(run("user?.role === 'admin'", { user: { role: 'admin' } })).toBe(true);
  });

  it('calls methods with the receiver as this', () => {
    const scope = { list: [1, 2, 3], obj: { n: 4, get() { return this.n; } } };
    expect(run('list.slice(1)', scope)).toEqual([2, 3]);
    expect(run('obj.get()', scope)).toBe(4);
  });

  it('calls bare identifiers with the scope as this, matching the old with() evaluator', () => {
    const scope = { n: 9, read() { return this.n; } };
    expect(run('read()', scope)).toBe(9);
  });
});

describe('arrow functions', () => {
  it('supports a single unparenthesized parameter', () => {
    const scope = { items: [{ active: true, id: 1 }, { active: false, id: 2 }] };
    expect(run('items.filter(i => i.active)', scope)).toEqual([{ active: true, id: 1 }]);
  });

  it('supports parenthesized parameter lists', () => {
    expect(run('nums.reduce((a, b) => a + b, 0)', { nums: [1, 2, 3] })).toBe(6);
    expect(run('make(() => 1)', { make: (f) => f() })).toBe(1);
  });

  it('sees the enclosing scope from the body', () => {
    const scope = { min: 2, nums: [1, 2, 3] };
    expect(run('nums.filter(n => n >= min)', scope)).toEqual([2, 3]);
  });

  it('does not write a parameter through to a same-named state key', () => {
    const scope = { item: 'original', items: ['a'] };
    run('items.map(item => item)', scope);
    expect(scope.item).toBe('original');
  });
});

describe('assignment and update', () => {
  it('writes an existing identifier back to scope', () => {
    const scope = { count: 1 };
    expect(run('count = 5', scope)).toBe(5);
    expect(scope.count).toBe(5);
  });

  it('creates a missing identifier on scope instead of leaking a global', () => {
    const scope = {};
    run('fresh = 1', scope);
    expect(scope.fresh).toBe(1);
    expect('fresh' in globalThis).toBe(false);
  });

  it('supports compound assignment and member targets', () => {
    const scope = { count: 1, obj: { n: 1 } };
    run('count += 4', scope);
    run('obj.n *= 3', scope);
    expect(scope.count).toBe(5);
    expect(scope.obj.n).toBe(3);
  });

  it('supports prefix and postfix increment', () => {
    const scope = { a: 1, b: 1 };
    expect(run('a++', scope)).toBe(1);
    expect(scope.a).toBe(2);
    expect(run('++b', scope)).toBe(2);
    expect(scope.b).toBe(2);
  });

  it('refuses to assign over a helper or a context name', () => {
    expect(() => run('$route = 1', {}, { helpers: { $route: {} } })).toThrow(TypeError);
    expect(() => run('event = 1', {})).toThrow(TypeError);
  });
});

describe('identifier resolution order', () => {
  it('lets helpers shadow state, as the nested with() blocks did', () => {
    const scope = { $element: 'from-state' };
    expect(run('$element', scope, { helpers: { $element: 'from-helpers' } })).toBe('from-helpers');
  });

  it('resolves through a prototype-chained loop scope', () => {
    const state = { title: 'parent' };
    const loopScope = Object.create(state);
    loopScope.item = { name: 'child' };
    expect(run('item.name + title', loopScope)).toBe('childparent');
  });

  it('reads every identifier off the scope object so a proxy get trap fires', () => {
    const reads = [];
    const scope = new Proxy({ a: 1, b: 2 }, {
      get: (t, k) => { reads.push(k); return t[k]; }
    });
    const fn = compile('a + b');
    fn(scope, ctx());
    fn(scope, ctx());
    expect(reads).toEqual(['a', 'b', 'a', 'b']);
  });

  it('resolves the named context values, including $event', () => {
    const event = { type: 'click' };
    expect(run('event.type', {}, { event })).toBe('click');
    expect(run('$event.type', {}, { event })).toBe('click');
    expect(run('self', {}, { self: 'el' })).toBe('el');
    expect(run('global.theme', {}, { global: { theme: 'dark' } })).toBe('dark');
  });

  it('consults ctx.extra between scope and the named values', () => {
    expect(run('shared', {}, { extra: { shared: 'globals' } })).toBe('globals');
    expect(run('shared', { shared: 'scope' }, { extra: { shared: 'globals' } })).toBe('scope');
  });
});

describe('sandbox', () => {
  it('exposes the allowlisted globals', () => {
    expect(run('Math.max(1, 2)')).toBe(2);
    expect(run('JSON.stringify({ a: 1 })')).toBe('{"a":1}');
    expect(run("parseInt('42', 10)")).toBe(42);
    expect(run('Number.isFinite')).toBeTypeOf('function');
  });

  it('makes every other global unreachable', () => {
    ['window', 'document', 'globalThis', 'fetch', 'Function', 'eval', 'localStorage',
      'location', 'navigator', 'XMLHttpRequest', 'setTimeout', 'importScripts', 'process']
      .forEach(name => {
        expect(() => run(name)).toThrow(ReferenceError);
      });
  });

  it('reports typeof for an unreachable global as undefined rather than throwing', () => {
    expect(run('typeof window')).toBe('undefined');
    expect(run("typeof window === 'undefined'")).toBe(true);
    expect(run('typeof missing')).toBe('undefined');
  });

  it('names the missing identifier in the ReferenceError', () => {
    expect(() => run('usre')).toThrow('usre is not defined');
  });

  const expectDenied = (src, scope) => {
    // expression.js throws a flagged error; safe-eval.js turns that into a
    // console.warn plus an undefined result (covered in the integration test).
    let caught;
    try { run(src, scope); } catch (e) { caught = e; }
    expect(caught, src).toBeTruthy();
    expect(caught.denied, src).toBeTruthy();
  };

  it('denies __proto__ and the reflection helpers by name', () => {
    const scope = { obj: {}, key: '__proto__', arr: ['__proto__'] };
    ['obj.__proto__', 'obj[key]', 'obj[arr]',
      'Object.getPrototypeOf(obj)', 'Object.setPrototypeOf(obj, null)',
      'Object.defineProperty(obj, "x", {})', 'Object.getOwnPropertyDescriptor(obj, "x")']
      .forEach(src => expectDenied(src, scope));
  });

  it('denies constructor / prototype only when the read yields a function', () => {
    const scope = { obj: {}, list: [], fn: () => 1, key: 'constructor' };
    ['obj.constructor', 'list.constructor', 'fn.constructor', 'fn.prototype',
      'Object.prototype', 'Array.prototype', 'obj[key]']
      .forEach(src => expectDenied(src, scope));
  });

  it('reads constructor / prototype as ordinary data fields', () => {
    expect(run('company.constructor', { company: { constructor: 'Bechtel' } })).toBe('Bechtel');
    expect(run('schema.prototype', { schema: { prototype: 'v2' } })).toBe('v2');
    expect(run('rec[k]', { rec: { constructor: 'Bechtel' }, k: 'constructor' })).toBe('Bechtel');
    // Absent on a plain object, so nothing function-shaped comes back.
    expect(run('obj.prototype', { obj: {} })).toBe(undefined);
  });

  it('denies every write to constructor / prototype / __proto__ unconditionally', () => {
    ['obj.constructor = 1', 'obj.prototype = 1', 'obj.__proto__ = 1', "obj['constructor'] = 1"]
      .forEach(src => expectDenied(src, { obj: {} }));
    expectDenied('{ __proto__: evil }', { evil: {} });
    expectDenied('{ [key]: evil }', { key: '__proto__', evil: {} });
  });

  it('allows constructor and prototype as keys of a fresh object literal', () => {
    // A literal builds a brand-new object, so these only create own data
    // properties. b-logic="{ constructor: 'Bechtel' }" must work.
    const out = run("{ constructor: 'Bechtel', prototype: 'v2' }", {});
    expect(Object.prototype.hasOwnProperty.call(out, 'constructor')).toBe(true);
    expect(out.constructor).toBe('Bechtel');
    expect(out.prototype).toBe('v2');
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    const computed = run("{ [k]: 'x' }", { k: 'constructor' });
    expect(computed.constructor).toBe('x');
  });

  it('denies a bare identifier that resolves to Object.prototype.constructor', () => {
    expect(() => run('constructor', {})).toThrow(/Denied/);
    expect(() => run('__proto__', {})).toThrow(/Denied/);
    // ... but not when the state really has that field.
    expect(run('constructor', { constructor: 'Bechtel' })).toBe('Bechtel');
  });

  it('leaves innocuous property names alone', () => {
    expect(run('item.class', { item: { class: 'card' } })).toBe('card');
    expect(run('pkg.module', { pkg: { module: 'auth' } })).toBe('auth');
    expect(run('x.eval', { x: { eval: 'harmless' } })).toBe('harmless');
    expect(run('x.import', { x: { import: 'harmless' } })).toBe('harmless');
  });

  it('blocks the classic constructor escape chain', () => {
    expect(() => run('obj.constructor.constructor("return 1")()', { obj: {} }))
      .toThrow(/Denied/);
  });
});

describe('new', () => {
  it('constructs allowlisted globals', () => {
    expect(run('new Date(2020, 0, 2).getFullYear()')).toBe(2020);
    expect(run('new Set([1, 1, 2]).size')).toBe(2);
    expect(run('new Map().size')).toBe(0);
    expect(run('typeof new Date')).toBe('object');
  });

  it('constructs from scope and through a member callee', () => {
    class Point { constructor(x) { this.x = x; } }
    expect(run('new Point(3).x', { Point })).toBe(3);
    expect(run('new lib.Point(4).x', { lib: { Point } })).toBe(4);
  });

  it('cannot reach a non-allowlisted constructor', () => {
    expect(() => run('new Function("return 1")')).toThrow(ReferenceError);
  });
});

describe('errors and caching', () => {
  it('throws a SyntaxError naming the position and the source', () => {
    let caught;
    try { compile('a + '); } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(SyntaxError);
    expect(caught.message).toContain('position 4');
    expect(caught.message).toContain('a + ');

    expect(() => compile('a b')).toThrow(/Unexpected token "b"/);
    expect(() => compile('a # b')).toThrow(/Unexpected character "#"/);
    expect(() => compile("'abc")).toThrow(/Unterminated/);
    expect(() => compile('{ inc() { this.n++ } }')).toThrow(SyntaxError);
  });

  it('returns the same compiled closure for the same source', () => {
    expect(compile('a.b + 1')).toBe(compile('a.b + 1'));
    expect(compile('a.b + 1')).not.toBe(compile('a.b + 2'));
  });

  it('caches a compile that failed on a denied name, and keeps re-throwing it', () => {
    const src = '{ __proto__: 1 }';
    const first = compile(src);
    expect(compile(src)).toBe(first);
    expect(() => first({}, ctx())).toThrow(/Denied/);
    expect(() => first({}, ctx())).toThrow(/Denied/);
  });

  it('does not cache a syntax error', () => {
    expect(() => compile('a +')).toThrow(SyntaxError);
    expect(() => compile('a +')).toThrow(SyntaxError);
  });

  it('exposes an AST from parse()', () => {
    expect(parse('a + 1')).toEqual({
      k: 'Bin',
      o: '+',
      a: { k: 'Id', n: 'a' },
      b: { k: 'Lit', v: 1 }
    });
  });
});
