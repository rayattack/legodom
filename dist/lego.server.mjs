// src/utils/helpers.js
var createConfig = (overrides = {}) => Object.assign({
  onError: (err, type, el) => {
    console.error(`[Lego Error] [${type}]`, err, el);
  },
  metrics: {},
  // Performance hooks
  debug: false,
  syntax: "brackets",
  // 'brackets' ([[ ]]) or 'mustache' ({{ }})
  // User-supplied sanitizer for b-html.safe. Receives the raw HTML string,
  // returns the cleaned HTML. If null, b-html.safe falls back to a small
  // built-in sanitizer (script/iframe/event-handler/javascript: stripping).
  // Set this to DOMPurify.sanitize for production-grade cleaning.
  sanitize: null,
  // Auto-discovery: if set, only tag names matching this pattern (or any of
  // these patterns when given an array) will be fetched. Default null = no
  // allowlist; a console warning is emitted on first use.
  loaderAllowlist: null,
  // Fetches the source of an unknown hyphenated tag. Set by init().
  loader: null,
  // Opt-in stricter runtime safety: re-throws undefined-identifier
  // ReferenceErrors instead of rendering '', and drops dangerous-scheme
  // (javascript:/data:text/html/vbscript:) values on URL-sink attributes.
  strict: false
}, overrides);
var config = createConfig();
var mergeDescriptors = (source, target) => {
  if (!source || !target) return;
  Object.getOwnPropertyNames(source).forEach((key) => {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    Object.defineProperty(target, key, desc);
  });
};
var deriveBlockName = (filename) => {
  const basename = filename.split("/").pop().replace(/\.lego$/, "");
  const name = basename.replace(/_/g, "-").replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
  if (!name.includes("-")) {
    throw new Error(`[Lego] Invalid block definition: "${filename}". Block names must contain a hyphen (e.g. user-card.lego or UserCard.lego).`);
  }
  return name;
};
var kebabCase = (name) => name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
var bindsAsProp = (tagName) => tagName.includes("-");
var BOOLEAN_ATTRS = new Set("allowfullscreen async autofocus autoplay checked controls default defer disabled formnovalidate hidden inert ismap itemscope loop multiple muted nomodule novalidate open playsinline readonly required reversed selected".split(" "));
var boundAttrText = (name, value) => {
  if (BOOLEAN_ATTRS.has(name)) return value || value === "" ? "" : null;
  if (value === null || value === void 0) return null;
  return String(value);
};
var resolve = (path, obj) => {
  if (!path) return "";
  const parts = path.trim().split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null) return "";
    current = current[part];
  }
  return current ?? "";
};

// src/utils/parser-utils.js
var readAttr = (attrs, name) => {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`, "i"));
  if (!match) return null;
  return match[1] !== void 0 ? match[1] : match[2];
};
function parseLego(content, filename = "block.lego") {
  const result = {
    template: "",
    script: "",
    style: "",
    stylesAttr: "",
    cascadeAttr: "",
    errorAttr: "",
    propsAttr: "",
    shadowAttr: "",
    formAttr: false,
    blockName: deriveBlockName(filename),
    hasTemplate: false,
    hasScript: false,
    hasStyle: false,
    // `<story>` sections are development metadata for Lego Studio. They are
    // parsed out here so they never reach the template, and the Vite plugin
    // drops them, so nothing a story declares is shipped to production.
    stories: []
  };
  let remaining = content;
  const startTagRegex = /<(template|script|style|story)\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;
  while (remaining) {
    const match = remaining.match(startTagRegex);
    if (!match) break;
    const tagName = match[1].toLowerCase();
    const attrs = match[2];
    const fullMatch = match[0];
    const startIndex = match.index;
    const closeTag = `</${tagName}>`;
    const contentStart = startIndex + fullMatch.length;
    const contentEnd = remaining.indexOf(closeTag, contentStart);
    if (contentEnd === -1) {
      console.warn(`[Lego] Unclosed <${tagName}> tag in ${filename}`);
      break;
    }
    const innerContent = remaining.slice(contentStart, contentEnd);
    if (tagName === "template") {
      result.hasTemplate = true;
      result.template = innerContent.trim();
      const bStyles = readAttr(attrs, "b-stylesheets");
      if (bStyles) result.stylesAttr = bStyles;
      const bCascade = readAttr(attrs, "b-cascade");
      if (bCascade) result.cascadeAttr = bCascade;
      const bError = readAttr(attrs, "b-error");
      if (bError) result.errorAttr = bError;
      const bProps = readAttr(attrs, "b-props");
      if (bProps) result.propsAttr = bProps;
      const bShadow = readAttr(attrs, "b-shadow");
      if (bShadow !== null) result.shadowAttr = bShadow;
      const bFormMatch = attrs.match(/(?:^|\s)b-form(?:=["']([^"']*)["'])?(?=\s|$)/);
      if (bFormMatch) {
        result.formAttr = bFormMatch[1] !== "false";
      }
    } else if (tagName === "script") {
      result.hasScript = true;
      result.script = innerContent.trim();
      const lang = readAttr(attrs, "lang");
      if (lang) result.scriptLang = lang;
    } else if (tagName === "style") {
      result.hasStyle = true;
      result.style = innerContent.trim();
    } else if (tagName === "story") {
      const storyName = readAttr(attrs, "name");
      result.stories.push({
        name: storyName && storyName.trim() || `Story ${result.stories.length + 1}`,
        args: (readAttr(attrs, "args") || "").trim(),
        globals: (readAttr(attrs, "globals") || "").trim(),
        slotHTML: innerContent.trim()
      });
    }
    remaining = remaining.slice(contentEnd + closeTag.length);
  }
  return result;
}
var SCRIPT_LOGIC = "__lego_logic";
var DEFAULT_EXPORT_AT = /(^|\n)([ \t]*)export\s+default\s+/;
var HAS_DEFAULT_EXPORT = /\bexport\s+default\s+/;
var DEFAULT_SPECIFIER = /(^|\n)[ \t]*export\s*\{\s*([\w$]+)\s+as\s+default\s*,?\s*\}\s*;?/;
var IMPORT_AT = /(^|\n)[ \t]*import\s*(?:[\w$*{]|['"])/;
var NAMED_EXPORT_AT = /(^|\n)([ \t]*)export\s+(?=(?:const|let|var|function|class|async\s+function)\b)/g;
var IMPORTS_NEED_BUNDLER = "`import` in a .lego script needs the Vite plugin (or another bundler). This script is evaluated without one, so it has to be self-contained: top-level helpers and constants are fine, imports are not.";
var scriptHasImports = (script) => IMPORT_AT.test(script || "");
var escapeName = (name) => name.replace(/\$/g, "\\$");
var declaresByText = (source, name) => {
  const id = escapeName(name);
  const imported = new RegExp(`\\bimport\\b[^;]*?[{,\\s]${id}\\s*(?:[,}]|\\bfrom\\b)`).test(source);
  const declared = new RegExp(`(?:^|[\\n;])\\s*(?:export\\s+)?(?:const|let|var|function\\*?|class)\\s+${id}\\b`).test(source);
  return imported || declared;
};
var patternNames = (node, out) => {
  if (!node) return;
  if (node.type === "Identifier") out.add(node.name);
  else if (node.type === "ObjectPattern") {
    node.properties.forEach((p) => patternNames(p.type === "RestElement" ? p.argument : p.value, out));
  } else if (node.type === "ArrayPattern") node.elements.forEach((e) => patternNames(e, out));
  else if (node.type === "RestElement") patternNames(node.argument, out);
  else if (node.type === "AssignmentPattern") patternNames(node.left, out);
};
var topLevelNames = (program) => {
  const out = /* @__PURE__ */ new Set();
  for (let node of program.body) {
    if (node.type === "ExportNamedDeclaration" && node.declaration) node = node.declaration;
    if (node.type === "ImportDeclaration") node.specifiers.forEach((s) => out.add(s.local.name));
    else if (node.type === "VariableDeclaration") node.declarations.forEach((d) => patternNames(d.id, out));
    else if ((node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") && node.id) out.add(node.id.name);
  }
  return out;
};
var defaultExportSpan = (source, program) => {
  const node = program && program.body.find((n) => n.type === "ExportDefaultDeclaration");
  if (node && source.startsWith("export", node.start) && node.declaration && node.declaration.start > node.start) {
    return { start: node.start, value: node.declaration.start };
  }
  const match = DEFAULT_EXPORT_AT.exec(source);
  if (match) return { start: match.index + match[1].length + match[2].length, value: match.index + match[0].length };
  const loose = HAS_DEFAULT_EXPORT.exec(source);
  return loose ? { start: loose.index, value: loose.index + loose[0].length } : null;
};
function scriptModule(script, parse2 = null) {
  const source = (script || "").trim();
  if (!source) return { code: "", logic: "{}", declares: () => false };
  const specifier = !HAS_DEFAULT_EXPORT.test(source) && DEFAULT_SPECIFIER.exec(source);
  if (specifier) {
    const code2 = source.slice(0, specifier.index) + specifier[1] + source.slice(specifier.index + specifier[0].length);
    const program2 = parse2 ? parse2(source) : null;
    const names2 = program2 ? topLevelNames(program2) : null;
    return { code: code2, logic: specifier[2], declares: (name) => names2 ? names2.has(name) : declaresByText(source, name) };
  }
  if (!HAS_DEFAULT_EXPORT.test(source)) {
    if (scriptHasImports(source)) {
      throw new Error("a script section with imports needs an `export default { \u2026 }` holding the block logic");
    }
    return { code: "", logic: `(${source})`, declares: () => false };
  }
  const program = parse2 ? parse2(source) : null;
  const names = program ? topLevelNames(program) : null;
  const declares = (name) => names ? names.has(name) : declaresByText(source, name);
  const span = defaultExportSpan(source, program);
  const code = `${source.slice(0, span.start)}const ${SCRIPT_LOGIC} = ${source.slice(span.value)}`;
  return { code, logic: SCRIPT_LOGIC, declares };
}
function scriptFunctionBody(script) {
  const source = (script || "").trim();
  if (!source) return "return {};";
  if (scriptHasImports(source)) throw new Error(IMPORTS_NEED_BUNDLER);
  const { code, logic } = scriptModule(source);
  if (!code) return `return ${logic};`;
  return `return (() => {
${code.replace(NAMED_EXPORT_AT, "$1$2")}
;return ${logic};
})();`;
}

// src/utils/lru-cache.js
var LRUCache = class {
  constructor(limit = 1e3) {
    this.limit = limit;
    this.cache = /* @__PURE__ */ new Map();
  }
  get(key) {
    if (!this.cache.has(key)) return void 0;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }
  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.limit) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
  get size() {
    return this.cache.size;
  }
  clear() {
    this.cache.clear();
  }
};

// src/utils/expression.js
var CACHE_LIMIT = 1e3;
var cache = new LRUCache(CACHE_LIMIT);
var dict = (obj) => Object.assign(/* @__PURE__ */ Object.create(null), obj);
var SAFE = dict({
  Math,
  JSON,
  Date,
  Number,
  String,
  Boolean,
  Array,
  Object,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  encodeURIComponent,
  decodeURIComponent,
  encodeURI,
  decodeURI,
  console,
  Intl,
  Promise,
  Set,
  Map,
  RegExp,
  NaN: NaN,
  Infinity: Infinity,
  undefined: void 0
});
var NAMED = dict({
  global: "global",
  self: "self",
  event: "event",
  $event: "event",
  helpers: "helpers"
});
var DENIED = new Set(
  "__proto__ getPrototypeOf setPrototypeOf defineProperty getOwnPropertyDescriptor constructor prototype".split(" ")
);
var deny = (name) => {
  const err = new Error(`[Lego] Denied access to "${name}"`);
  err.denied = name;
  throw err;
};
var norm = (key) => key !== null && typeof key === "object" ? String(key) : key;
var literalKey = (key) => {
  const k = norm(key);
  if (k === "__proto__") deny(k);
  return k;
};
var readId = (name, scope, ctx) => {
  const helpers = ctx.helpers;
  if (helpers && name in helpers) return readProp(helpers, name);
  if (scope && name in scope) return readProp(scope, name);
  const extra = ctx.extra;
  if (extra && name in extra) return readProp(extra, name);
  if (name in NAMED) return ctx[NAMED[name]];
  if (name in SAFE) return SAFE[name];
  throw new ReferenceError(`${name} is not defined`);
};
var writeId = (name, scope, ctx, value) => {
  if (DENIED.has(name)) deny(name);
  if (scope && name in scope) {
    scope[name] = value;
    return value;
  }
  const helpers = ctx.helpers;
  const shadowed = helpers && name in helpers || name in NAMED || ctx.extra && name in ctx.extra;
  if (shadowed) throw new TypeError(`[Lego] Cannot assign to "${name}"`);
  if (scope) scope[name] = value;
  return value;
};
var readProp = (obj, key) => {
  const k = norm(key);
  if (!DENIED.has(k)) return obj[k];
  const value = obj[k];
  const dataField = (k === "constructor" || k === "prototype") && typeof obj !== "function" && typeof value !== "function";
  if (!dataField) deny(k);
  return value;
};
var writeProp = (obj, key, value) => {
  const k = norm(key);
  if (DENIED.has(k)) deny(k);
  obj[k] = value;
  return value;
};
var ESC_NAMES = "nrtbfv0";
var ESC_VALUES = "\n\r	\b\f\v\0";
var unescape = (c) => {
  const at = ESC_NAMES.indexOf(c);
  return at < 0 ? c : ESC_VALUES[at];
};
var TOKEN_RE = new RegExp([
  "\\s+",
  "(\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?|\\.\\d+)",
  "([A-Za-z_$][\\w$]*)",
  "(===|!==|=>|[=!<>]=|&&|\\|\\||\\?\\?|\\?\\.|\\+\\+|--|[-+*/]=|\\*\\*|[-+*/%!<>?:.,()[\\]{}=])"
].join("|"), "y");
var UNTERMINATED = "Unterminated literal";
var syntaxError = (msg, at, src) => new SyntaxError(`[Lego] ${msg} at position ${at} in expression: ${src}`);
function readString(src, start) {
  const quote = src[start];
  let out = "";
  let i = start + 1;
  while (i < src.length && src[i] !== quote) {
    if (src[i] !== "\\") {
      out += src[i++];
      continue;
    }
    out += unescape(src[i + 1]);
    i += 2;
  }
  if (i >= src.length) throw syntaxError(UNTERMINATED, start, src);
  return [out, i + 1];
}
function closingBrace(src, start) {
  let depth = 1;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = readString(src, i)[1];
      continue;
    }
    if (c === "`") {
      i = readTemplate(src, i)[1];
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && !--depth) return i;
    i++;
  }
  throw syntaxError(UNTERMINATED, start, src);
}
function readTemplate(src, start) {
  const qs = [];
  const xs = [];
  let chunk = "";
  let i = start + 1;
  while (i < src.length && src[i] !== "`") {
    if (src[i] === "\\") {
      chunk += unescape(src[i + 1]);
      i += 2;
      continue;
    }
    if (src[i] === "$" && src[i + 1] === "{") {
      const end = closingBrace(src, i + 2);
      xs.push(src.slice(i + 2, end));
      qs.push(chunk);
      chunk = "";
      i = end + 1;
      continue;
    }
    chunk += src[i++];
  }
  if (i >= src.length) throw syntaxError(UNTERMINATED, start, src);
  qs.push(chunk);
  return [{ qs, xs }, i + 1];
}
var tokenize = (src) => {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      const quoted = c === "`";
      const [value, next] = quoted ? readTemplate(src, i) : readString(src, i);
      out.push({ t: quoted ? "t" : "s", v: value, i });
      i = next;
      continue;
    }
    TOKEN_RE.lastIndex = i;
    const m = TOKEN_RE.exec(src);
    if (!m) throw syntaxError(`Unexpected character "${c}"`, i, src);
    const [all, num, name, punct] = m;
    if (num !== void 0) {
      out.push({ t: "n", v: Number(num), i });
    } else if (name !== void 0) {
      out.push({ t: "i", v: name, i });
    } else if (punct !== void 0) {
      out.push({ t: "p", v: punct, i });
    }
    i += all.length;
  }
  out.push({ t: "e", v: "", i });
  return out;
};
var BIN_GROUPS = ["??", "||", "&&", "== != === !==", "< > <= >= in", "+ -", "* / %", "**"];
var PREC = dict({});
BIN_GROUPS.forEach((group, index) => {
  group.split(" ").forEach((op) => {
    PREC[op] = index + 1;
  });
});
var LOGICAL_MAX_PREC = PREC["&&"];
var ASSIGN_OPS = new Set("= += -= *= /=".split(" "));
var UNARY_OPS = dict({ "!": (v) => !v, "-": (v) => -v, "+": (v) => +v });
var KEYWORDS = dict({ true: true, false: false, null: null, undefined: void 0 });
var toks = null;
var pos = 0;
var text = "";
var fail = () => {
  const t = toks[pos];
  throw syntaxError(
    t.t === "e" ? "Unexpected end of input" : `Unexpected token "${t.v}"`,
    t.i,
    text
  );
};
var isPunct = (v) => {
  const t = toks[pos];
  return t.t === "p" && t.v === v;
};
var eat = (v) => {
  if (!isPunct(v)) return false;
  pos++;
  return true;
};
var expect = (v) => {
  if (!eat(v)) fail();
};
var identName = () => {
  const t = toks[pos];
  if (t.t !== "i") fail();
  pos++;
  return t.v;
};
var assignable = (node) => {
  if (node.k !== "Id" && node.k !== "Mem") fail();
  return node;
};
var parseList = (close, item) => {
  const out = [];
  if (eat(close)) return out;
  do {
    if (isPunct(close)) break;
    out.push(item());
  } while (eat(","));
  expect(close);
  return out;
};
var parseArgs = () => parseList(")", parseAssign);
var parseProp = () => {
  if (eat("[")) {
    const key = parseAssign();
    expect("]");
    expect(":");
    return { c: true, k: key, v: parseAssign() };
  }
  const t = toks[pos];
  if (t.t !== "i" && t.t !== "s" && t.t !== "n") fail();
  pos++;
  const name = String(t.v);
  if (eat(":")) return { c: false, k: name, v: parseAssign() };
  if (t.t === "i" && (isPunct(",") || isPunct("}"))) {
    return { c: false, k: name, v: { k: "Id", n: name } };
  }
  return fail();
};
var parseArrow = (params) => {
  expect("=>");
  return { k: "Arw", ps: params, b: parseAssign() };
};
var paramNames = (node) => {
  if (node.k === "Id") return [node.n];
  if (node.k !== "Seq") fail();
  return paramNames(node.a).concat(paramNames(node.b));
};
var parseName = () => {
  const name = identName();
  if (isPunct("=>")) return parseArrow([name]);
  if (name === "this") return { k: "This" };
  if (name in KEYWORDS) return { k: "Lit", v: KEYWORDS[name] };
  return { k: "Id", n: name };
};
var parsePrimary = () => {
  const t = toks[pos];
  if (t.t === "n" || t.t === "s") {
    pos++;
    return { k: "Lit", v: t.v };
  }
  if (t.t === "t") {
    pos++;
    return { k: "Tpl", qs: t.v.qs, xs: t.v.xs.map((src) => parse(src)) };
  }
  if (t.t === "i") return parseName();
  if (eat("(")) {
    if (eat(")")) return parseArrow([]);
    const inner = parseSequence();
    expect(")");
    return isPunct("=>") ? parseArrow(paramNames(inner)) : inner;
  }
  if (eat("[")) return { k: "Arr", es: parseList("]", parseAssign) };
  if (eat("{")) return { k: "Obj", ps: parseList("}", parseProp) };
  return fail();
};
var parseHead = () => {
  const t = toks[pos];
  if (t.t !== "i" || t.v !== "new") return parsePrimary();
  pos++;
  let callee = parsePrimary();
  while (eat(".")) callee = { k: "Mem", o: callee, pr: identName(), c: false };
  return { k: "New", f: callee, a: eat("(") ? parseArgs() : [] };
};
var parseSubject = () => {
  let node = parseHead();
  let optional = false;
  for (; ; ) {
    const opt = eat("?.");
    if (opt) optional = true;
    if (eat("[")) {
      const key = parseSequence();
      expect("]");
      node = { k: "Mem", o: node, pr: key, c: true, opt };
      continue;
    }
    if (eat("(")) {
      node = { k: "Call", f: node, a: parseArgs(), opt };
      continue;
    }
    if (!opt && !eat(".")) break;
    node = { k: "Mem", o: node, pr: identName(), c: false, opt };
  }
  return optional ? { k: "Chain", a: node } : node;
};
var parseUnary = () => {
  const t = toks[pos];
  if (t.t === "p" && UNARY_OPS[t.v]) {
    pos++;
    return { k: "Un", o: t.v, a: parseUnary() };
  }
  if (t.t === "p" && (t.v === "++" || t.v === "--")) {
    pos++;
    return { k: "Asg", o: `${t.v[0]}=`, a: assignable(parseUnary()), b: { k: "Lit", v: 1 } };
  }
  if (t.t === "i" && t.v === "typeof") {
    pos++;
    return { k: "Un", o: "typeof", a: parseUnary() };
  }
  const node = parseSubject();
  const next = toks[pos];
  if (next.t === "p" && (next.v === "++" || next.v === "--")) {
    pos++;
    return { k: "Upd", o: next.v, a: assignable(node) };
  }
  return node;
};
var parseBinary = (min) => {
  let left = parseUnary();
  for (; ; ) {
    const t = toks[pos];
    const op = t.t === "p" || t.t === "i" && t.v === "in" ? t.v : null;
    const prec = op ? PREC[op] : void 0;
    if (!prec || prec < min) return left;
    pos++;
    const right = parseBinary(op === "**" ? prec : prec + 1);
    left = { k: prec <= LOGICAL_MAX_PREC ? "Log" : "Bin", o: op, a: left, b: right };
  }
};
var parseConditional = () => {
  const test = parseBinary(1);
  if (!eat("?")) return test;
  const consequent = parseAssign();
  expect(":");
  return { k: "Cond", t: test, a: consequent, b: parseAssign() };
};
function parseAssign() {
  const left = parseConditional();
  const t = toks[pos];
  if (t.t !== "p" || !ASSIGN_OPS.has(t.v)) return left;
  pos++;
  assignable(left);
  return { k: "Asg", o: t.v, a: left, b: parseAssign() };
}
function parseSequence() {
  let node = parseAssign();
  while (eat(",")) node = { k: "Seq", a: node, b: parseAssign() };
  return node;
}
function parse(src) {
  const saved = [toks, pos, text];
  try {
    toks = tokenize(src);
    pos = 0;
    text = src;
    if (toks[0].t === "e") return { k: "Lit", v: void 0 };
    const node = parseSequence();
    if (toks[pos].t !== "e") fail();
    return node;
  } finally {
    [toks, pos, text] = saved;
  }
}
var BIN = dict({
  "+": (a, b) => a + b,
  "-": (a, b) => a - b,
  "*": (a, b) => a * b,
  "/": (a, b) => a / b,
  "%": (a, b) => a % b,
  "**": (a, b) => a ** b,
  "==": (a, b) => a == b,
  // eslint-disable-line eqeqeq
  "!=": (a, b) => a != b,
  // eslint-disable-line eqeqeq
  "===": (a, b) => a === b,
  "!==": (a, b) => a !== b,
  "<": (a, b) => a < b,
  ">": (a, b) => a > b,
  "<=": (a, b) => a <= b,
  ">=": (a, b) => a >= b,
  in: (a, b) => a in b
});
var SHORT = {};
var lastBase;
var genMember = (n) => {
  const obj = gen(n.o);
  const opt = n.opt;
  const keyFn = n.c ? gen(n.pr) : null;
  const key = n.pr;
  return (s, c) => {
    const base = obj(s, c);
    lastBase = base;
    if (base === SHORT || opt && base == null) return SHORT;
    return readProp(base, keyFn ? keyFn(s, c) : key);
  };
};
var genCall = (n) => {
  const argFns = n.a.map(gen);
  const fnOf = gen(n.f);
  const method = n.f.k === "Mem";
  return (s, c) => {
    const fn = fnOf(s, c);
    const base = method ? lastBase : s;
    if (fn === SHORT) return SHORT;
    if (n.opt && fn == null) return SHORT;
    return fn.apply(base, argFns.map((f) => f(s, c)));
  };
};
var genNew = (n) => {
  const fnOf = gen(n.f);
  const argFns = n.a.map(gen);
  return (s, c) => new (fnOf(s, c))(...argFns.map((f) => f(s, c)));
};
var genRef = (n) => {
  if (n.k === "Id") {
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
var genAssign = (n) => {
  const ref = genRef(n.a);
  const value = gen(n.b);
  if (n.o === "=") return (s, c) => ref.set(s, c, value(s, c));
  const apply = BIN[n.o[0]];
  return (s, c) => ref.set(s, c, apply(ref.get(s, c), value(s, c)));
};
var genUpdate = (n) => {
  const ref = genRef(n.a);
  const delta = n.o === "++" ? 1 : -1;
  return (s, c) => {
    const before = Number(ref.get(s, c));
    ref.set(s, c, before + delta);
    return before;
  };
};
var PARAM_DESC = { value: void 0, writable: true, configurable: true };
var genArrow = (n) => {
  const body = gen(n.b);
  const params = n.ps;
  return (s, c) => function(...args) {
    const frame = Object.create(s || null);
    params.forEach((p, i) => {
      PARAM_DESC.value = args[i];
      Object.defineProperty(frame, p, PARAM_DESC);
    });
    return body(frame, c);
  };
};
var genObject = (n) => {
  const props = n.ps.map((p) => ({ c: p.c, k: p.c ? gen(p.k) : literalKey(p.k), v: gen(p.v) }));
  return (s, c) => {
    const out = {};
    props.forEach((p) => {
      out[p.c ? literalKey(p.k(s, c)) : p.k] = p.v(s, c);
    });
    return out;
  };
};
var genTemplate = (n) => {
  const chunks = n.qs;
  const parts = n.xs.map(gen);
  return (s, c) => {
    let out = chunks[0];
    for (let i = 0; i < parts.length; i++) out += parts[i](s, c) + chunks[i + 1];
    return out;
  };
};
var genUnary = (n) => {
  const operand = gen(n.a);
  if (n.o !== "typeof") {
    const apply = UNARY_OPS[n.o];
    return (s, c) => apply(operand(s, c));
  }
  return (s, c) => {
    try {
      return typeof operand(s, c);
    } catch (e) {
      if (e instanceof ReferenceError) return "undefined";
      throw e;
    }
  };
};
var genLogical = (n) => {
  const a = gen(n.a);
  const b = gen(n.b);
  if (n.o === "&&") return (s, c) => a(s, c) && b(s, c);
  if (n.o === "||") return (s, c) => a(s, c) || b(s, c);
  return (s, c) => a(s, c) ?? b(s, c);
};
var GEN = dict({
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
      return v === SHORT ? void 0 : v;
    };
  },
  Arr: (n) => {
    const items = n.es.map(gen);
    return (s, c) => items.map((f) => f(s, c));
  },
  Cond: (n) => {
    const test = gen(n.t);
    const a = gen(n.a);
    const b = gen(n.b);
    return (s, c) => test(s, c) ? a(s, c) : b(s, c);
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
var compile = (src) => {
  let fn = cache.get(src);
  if (fn) return fn;
  try {
    fn = gen(parse(src));
  } catch (e) {
    if (!e || !e.denied) throw e;
    fn = () => {
      throw e;
    };
  }
  cache.set(src, fn);
  return fn;
};

// src/directives/b-props.js
var TYPES = ["String", "Number", "Boolean", "Array", "Object", "Function"];
var DECL = /^([a-zA-Z_$][\w$]*)\s*(?::\s*([A-Za-z]+))?\s*(?:=\s*([\s\S]+))?$/;
var splitDeclarations = (body) => {
  const out = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quote) {
      if (ch === "\\") i++;
      else if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    if (ch === ")" || ch === "]" || ch === "}") depth--;
    if (ch !== "," || depth !== 0) continue;
    out.push(body.slice(start, i));
    start = i + 1;
  }
  out.push(body.slice(start));
  return out.map((t) => t.trim()).filter(Boolean);
};
var compileDefault = (src, tagName, name) => {
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
      return void 0;
    }
  };
};
var parseProps = (raw, tagName = "<unknown>") => {
  if (!raw || typeof raw !== "string") return null;
  let body = raw.trim();
  if (!body) return null;
  if (body.startsWith("{") && body.endsWith("}")) {
    body = body.slice(1, -1).trim();
    if (!body) return null;
  }
  const tokens = splitDeclarations(body);
  if (tokens.length === 0) return null;
  const out = [];
  for (const tok of tokens) {
    const match = DECL.exec(tok);
    const type = match && match[2];
    if (!match || type && !TYPES.includes(type)) {
      console.error(
        `[Lego] Invalid b-props on <${tagName}>: "${tok}" is not a valid prop declaration. Write name, name: Type, or either with = default, where Type is one of ${TYPES}.`
      );
      return null;
    }
    out.push({
      name: match[1],
      type: type || null,
      defaultFn: compileDefault(match[3], tagName, match[1]),
      // The unevaluated default text, which tooling shows next to a control.
      defaultSource: match[3] ? match[3].trim() : null,
      attr: kebabCase(match[1])
    });
  }
  return out;
};

// src/server/html.js
var COMMENT_OPEN = "<!--";
var COMMENT_CLOSE = "-->";
var SELF_CLOSE = "/>";
var CLOSE_TAG_OPEN = "</";
var VOID_ELEMENTS = /* @__PURE__ */ new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr"
]);
var RAW_TEXT_ELEMENTS = /* @__PURE__ */ new Set(["style", "script", "textarea", "title"]);
var TAG_NAME_START = /[a-zA-Z]/;
var TAG_NAME_CHAR = /[a-zA-Z0-9-]/;
var AFTER_TAG_NAME = /[\s/>]/;
var SPACE = /\s/;
var ATTR_NAME_END = /[\s/>=]/;
var TEXT_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
var ATTR_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
var escapeText = (value) => String(value).replace(/[&<>]/g, (c) => TEXT_ESCAPES[c]);
var escapeAttr = (value) => String(value).replace(/[&<>"]/g, (c) => ATTR_ESCAPES[c]);
var skipSpace = (source, from) => {
  let i = from;
  while (i < source.length && SPACE.test(source[i])) i++;
  return i;
};
var tagNameEnd = (source, from) => {
  if (!TAG_NAME_START.test(source[from] || "")) return -1;
  let i = from + 1;
  while (i < source.length && TAG_NAME_CHAR.test(source[i])) i++;
  if (i < source.length && !AFTER_TAG_NAME.test(source[i])) return -1;
  return i;
};
var rawTextClose = (source, from, tag) => {
  const needle = `${CLOSE_TAG_OPEN}${tag}`;
  const lower = source.toLowerCase();
  let at = lower.indexOf(needle, from);
  while (at >= 0) {
    const after = source[at + needle.length];
    if (after === void 0 || AFTER_TAG_NAME.test(after)) return at;
    at = lower.indexOf(needle, at + needle.length);
  }
  return -1;
};
var readAttributes = (source, from, fail2) => {
  const attrs = [];
  let i = from;
  for (; ; ) {
    i = skipSpace(source, i);
    if (i >= source.length) return fail2("unterminated tag", from);
    if (source[i] === ">") return { attrs, end: i + 1, selfClosed: false };
    if (source.startsWith(SELF_CLOSE, i)) {
      return { attrs, end: i + SELF_CLOSE.length, selfClosed: true };
    }
    const nameStart = i;
    while (i < source.length && !ATTR_NAME_END.test(source[i])) i++;
    if (i === nameStart) return fail2(`unexpected character "${source[i]}" in tag`, i);
    const name = source.slice(nameStart, i);
    const afterName = skipSpace(source, i);
    if (source[afterName] !== "=") {
      attrs.push([name, null]);
      i = afterName;
      continue;
    }
    i = skipSpace(source, afterName + 1);
    const quote = source[i];
    if (quote !== '"' && quote !== "'") {
      const valueStart = i;
      while (i < source.length && !/[\s>]/.test(source[i])) i++;
      if (i === valueStart) return fail2(`missing value for attribute "${name}"`, i);
      attrs.push([name, source.slice(valueStart, i)]);
      continue;
    }
    const close = source.indexOf(quote, i + 1);
    if (close < 0) return fail2(`unterminated value for attribute "${name}"`, i);
    const raw = source.slice(i + 1, close);
    attrs.push([name, quote === "'" ? raw.replace(/"/g, "&quot;") : raw]);
    i = close + 1;
  }
};
function parseHTML(source, label = "template", options = {}) {
  const lenient = options.lenient === true;
  const root = { type: "el", tag: null, attrs: [], children: [] };
  const stack = [{ node: root, tag: null, start: 0 }];
  let i = 0;
  let textStart = 0;
  const fail2 = (message, at) => {
    throw new Error(`[Lego SSR] ${label}: ${message} at offset ${at}`);
  };
  const top = () => stack[stack.length - 1];
  const push = (node) => top().node.children.push(node);
  const flushText = (end) => {
    if (end <= textStart) return;
    push({ type: "text", value: source.slice(textStart, end), raw: false });
  };
  const closeTo = (tag) => {
    for (let at = stack.length - 1; at > 0; at--) {
      if (stack[at].tag !== tag) continue;
      stack.length = at;
      return true;
    }
    return false;
  };
  while (i < source.length) {
    const lt = source.indexOf("<", i);
    if (lt < 0) break;
    if (source.startsWith(COMMENT_OPEN, lt)) {
      const end = source.indexOf(COMMENT_CLOSE, lt + COMMENT_OPEN.length);
      if (end < 0) return fail2("unterminated comment", lt);
      flushText(lt);
      push({ type: "comment", value: source.slice(lt + COMMENT_OPEN.length, end) });
      i = end + COMMENT_CLOSE.length;
      textStart = i;
      continue;
    }
    if (source[lt + 1] === "!") {
      if (lenient) {
        i = lt + 1;
        continue;
      }
      return fail2("doctypes and markup declarations are not part of a block template", lt);
    }
    if (source.startsWith(CLOSE_TAG_OPEN, lt)) {
      const nameEnd2 = tagNameEnd(source, lt + CLOSE_TAG_OPEN.length);
      const gt2 = nameEnd2 < 0 ? -1 : skipSpace(source, nameEnd2);
      if (nameEnd2 < 0 || source[gt2] !== ">") {
        if (lenient) {
          i = lt + 1;
          continue;
        }
        return fail2("malformed closing tag", lt);
      }
      const tag2 = source.slice(lt + CLOSE_TAG_OPEN.length, nameEnd2).toLowerCase();
      flushText(lt);
      i = gt2 + 1;
      textStart = i;
      const open = top();
      if (open.tag === tag2) {
        stack.pop();
        continue;
      }
      if (lenient) {
        closeTo(tag2);
        continue;
      }
      if (open.tag === null) return fail2(`closing tag </${tag2}> matches no open element`, lt);
      return fail2(`closing tag </${tag2}> does not match the open <${open.tag}> element`, lt);
    }
    const nameEnd = tagNameEnd(source, lt + 1);
    if (nameEnd < 0) {
      i = lt + 1;
      continue;
    }
    const tag = source.slice(lt + 1, nameEnd).toLowerCase();
    const read = readAttributes(source, nameEnd, fail2);
    flushText(lt);
    const node = { type: "el", tag, attrs: read.attrs, children: [] };
    push(node);
    i = read.end;
    textStart = i;
    if (VOID_ELEMENTS.has(tag) || read.selfClosed) continue;
    if (!RAW_TEXT_ELEMENTS.has(tag)) {
      stack.push({ node, tag, start: lt });
      continue;
    }
    const close = rawTextClose(source, i, tag);
    if (close < 0) return fail2(`unterminated <${tag}> element`, lt);
    if (close > i) node.children.push({ type: "text", value: source.slice(i, close), raw: true });
    const gt = source.indexOf(">", close);
    if (gt < 0) return fail2(`unterminated closing tag for <${tag}>`, close);
    i = gt + 1;
    textStart = i;
  }
  flushText(source.length);
  if (stack.length > 1 && !lenient) {
    const open = top();
    return fail2(`unclosed <${open.tag}> element`, open.start);
  }
  return root.children;
}
var serializeAttrs = (attrs) => attrs.map(([name, value]) => value === null ? ` ${name}` : ` ${name}="${value}"`).join("");
var serializeNode = (node) => {
  if (node.type === "text") return node.value;
  if (node.type === "comment") return `${COMMENT_OPEN}${node.value}${COMMENT_CLOSE}`;
  const open = `<${node.tag}${serializeAttrs(node.attrs)}>`;
  if (VOID_ELEMENTS.has(node.tag)) return open;
  return `${open}${serialize(node.children)}</${node.tag}>`;
};
function serialize(nodes) {
  return nodes.map(serializeNode).join("");
}
var attrValue = (node, name) => {
  const found = node.attrs.find(([attrName]) => attrName === name);
  return found ? found[1] : void 0;
};
var findAttr = (node, base) => {
  const prefix = `${base}.`;
  const found = node.attrs.find(([name]) => name === base || name.startsWith(prefix));
  if (!found) return null;
  return { name: found[0], value: found[1] === null ? "" : found[1], modifiers: found[0].split(".").slice(1) };
};

// src/server/css.js
var COMMENT_OPEN2 = "/*";
var COMMENT_CLOSE2 = "*/";
var ESCAPE_SEQUENCE_LENGTH = 2;
var NESTING_AT_RULES = /* @__PURE__ */ new Set(["media", "supports", "container", "layer"]);
var SEGMENT_SENTINEL = "__LEGO_SEG_";
var SEGMENT_RE = /__LEGO_SEG_(\d+)__/g;
var CSS_LITERAL_RE = /\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g;
var SELF_SELECTOR_RE = /(?<![-\w])self(?![-\w])/g;
var SELF_SELECTOR_TEST = /(?<![-\w])self(?![-\w])/;
var LEAD_BODY_TRAIL = /^(\s*)([\s\S]*?)(\s*)$/;
var withLiteralsStashed = (source, transform) => {
  const segments = [];
  const stashed = source.replace(CSS_LITERAL_RE, (match) => {
    segments.push(match);
    return `${SEGMENT_SENTINEL}${segments.length - 1}__`;
  });
  return transform(stashed).replace(SEGMENT_RE, (_, index) => segments[Number(index)]);
};
var skipString = (css, at) => {
  const quote = css[at];
  let i = at + 1;
  while (i < css.length) {
    if (css[i] === "\\") {
      i += ESCAPE_SEQUENCE_LENGTH;
      continue;
    }
    if (css[i] === quote) return i + 1;
    i++;
  }
  return i;
};
var skipComment = (css, at) => {
  const end = css.indexOf(COMMENT_CLOSE2, at + COMMENT_OPEN2.length);
  return end < 0 ? css.length : end + COMMENT_CLOSE2.length;
};
var isCommentStart = (css, at) => css[at] === "/" && css[at + 1] === "*";
var isQuote = (ch) => ch === '"' || ch === "'";
var matchingBrace = (css, open) => {
  let depth = 0;
  let i = open;
  while (i < css.length) {
    const ch = css[i];
    if (isCommentStart(css, i)) {
      i = skipComment(css, i);
      continue;
    }
    if (isQuote(ch)) {
      i = skipString(css, i);
      continue;
    }
    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return css.length;
};
var splitRules = (css) => {
  const rules = [];
  let i = 0;
  let start = 0;
  while (i < css.length) {
    const ch = css[i];
    if (isCommentStart(css, i)) {
      i = skipComment(css, i);
      continue;
    }
    if (isQuote(ch)) {
      i = skipString(css, i);
      continue;
    }
    if (ch === ";") {
      const raw = css.slice(start, i + 1);
      rules.push({ raw, prelude: raw, body: null });
      i++;
      start = i;
      continue;
    }
    if (ch === "{") {
      const end = matchingBrace(css, i);
      rules.push({
        raw: css.slice(start, end + 1),
        prelude: css.slice(start, i),
        body: css.slice(i + 1, end)
      });
      i = end + 1;
      start = i;
      continue;
    }
    i++;
  }
  const tail = css.slice(start);
  if (tail) rules.push({ raw: tail, prelude: tail, body: null });
  return rules;
};
var splitSelectors = (prelude) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < prelude.length) {
    const ch = prelude[i];
    if (isQuote(ch)) {
      i = skipString(prelude, i);
      continue;
    }
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      parts.push(prelude.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  parts.push(prelude.slice(start));
  return parts;
};
var scopeSelector = (part, tagName) => {
  const [, lead, selector, trail] = part.match(LEAD_BODY_TRAIL);
  if (!selector) return part;
  const scoped = withLiteralsStashed(selector, (stashed) => SELF_SELECTOR_TEST.test(stashed) ? stashed.replace(SELF_SELECTOR_RE, tagName) : `${tagName} ${stashed}`);
  return `${lead}${scoped}${trail}`;
};
var atRuleName = (prelude) => {
  const match = prelude.trim().match(/^@([-\w]+)/);
  return match ? match[1].toLowerCase() : "";
};
function scopeRules(css, tagName) {
  return splitRules(css).map((rule) => {
    if (rule.body === null) return rule.raw;
    const name = atRuleName(rule.prelude);
    if (name && !NESTING_AT_RULES.has(name)) return rule.raw;
    if (name) return `${rule.prelude}{${scopeRules(rule.body, tagName)}}`;
    const selectors = splitSelectors(rule.prelude).map((part) => scopeSelector(part, tagName)).join(",");
    return `${selectors}{${rule.body}}`;
  }).join("");
}
var scopeStyles = (css, tagName, shadow) => {
  if (!css) return "";
  if (!shadow) return scopeRules(css, tagName);
  return withLiteralsStashed(css, (stashed) => stashed.replace(SELF_SELECTOR_RE, ":host"));
};

// src/server/sanitize.js
var DANGEROUS_TAGS = /* @__PURE__ */ new Set(["script", "iframe", "object", "embed", "link", "meta", "base", "style"]);
var URL_ATTRS = /* @__PURE__ */ new Set(["href", "src", "xlink:href", "action", "formaction", "srcdoc", "data"]);
var SHADOW_ATTRS = /* @__PURE__ */ new Set(["shadowrootmode", "shadowroot"]);
var EVENT_ATTR_PREFIX = "on";
var isDangerousUrl = (value) => {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v.startsWith("javascript:") || v.startsWith("data:text/html") || v.startsWith("vbscript:");
};
var keepAttr = (tag, name, value) => {
  const lower = name.toLowerCase();
  if (lower.startsWith(EVENT_ATTR_PREFIX)) return false;
  if (tag === "template" && SHADOW_ATTRS.has(lower)) return false;
  return !(URL_ATTRS.has(lower) && isDangerousUrl(value));
};
var cleanNode = (node) => {
  if (node.type !== "el") return node;
  return {
    type: "el",
    tag: node.tag,
    attrs: node.attrs.filter(([name, value]) => keepAttr(node.tag, name, value)),
    children: cleanNodes(node.children)
  };
};
function cleanNodes(nodes) {
  return nodes.filter((node) => node.type !== "el" || !DANGEROUS_TAGS.has(node.tag)).map(cleanNode);
}
var sanitizeHTML = (html, label = "b-html.safe") => {
  if (typeof html !== "string" || html === "") return html;
  try {
    return serialize(cleanNodes(parseHTML(html, label, { lenient: true })));
  } catch (err) {
    return escapeText(html);
  }
};

// src/server/render.js
var MAX_BLOCK_DEPTH = 32;
var MAX_REPORTED_SOURCE = 80;
var GLOBAL_PREFIX = "global.";
var FOR_SYNTAX = /^\s*(\w+)\s+in\s+([\s\S]+?)\s*$/;
var HIDDEN_STYLE = "display: none";
var truncate = (raw) => raw.length > MAX_REPORTED_SOURCE ? `${raw.slice(0, MAX_REPORTED_SOURCE)}...` : raw;
var blockError = (frame, message, cause) => {
  const err = new Error(`[Lego SSR] <${frame.name}>: ${message}`);
  if (cause) err.cause = cause;
  return err;
};
var evaluate = (frame, source, scope) => {
  const { ctx } = frame;
  try {
    return compile(source)(scope, {
      helpers: ctx.helpers,
      global: ctx.globals,
      self: null,
      // No event context, so a function valued result is never auto invoked.
      // That is exactly what the client does outside an event handler.
      event: void 0
    });
  } catch (err) {
    if (err && err.denied) {
      console.warn(`[Lego SSR] <${frame.name}>: blocked access to "${err.denied}" in "${truncate(source)}"`);
      return void 0;
    }
    if (err instanceof ReferenceError) return void 0;
    throw blockError(frame, `failed evaluating "${truncate(source)}": ${err.message}`, err);
  }
};
var truthy = (frame, source, scope) => !!evaluate(frame, source, scope);
var asText = (value) => value === void 0 || value === null ? "" : String(value);
var interpolate = (frame, template, scope, escape) => {
  const { ctx } = frame;
  if (!template.includes(ctx.delimiterStart)) return template;
  return template.replace(ctx.delimiterRe, (_, expr) => escape(asText(evaluate(frame, expr.trim(), scope))));
};
var buildState = (logic, props, propDefaults = []) => {
  const state = {};
  mergeDescriptors(logic, state);
  for (const prop of propDefaults) {
    if (state[prop.name] === void 0) state[prop.name] = prop.get();
  }
  mergeDescriptors(props, state);
  return state;
};
var setAttr = (attrs, name, value) => {
  const found = attrs.find(([attrName]) => attrName === name);
  if (found) {
    found[1] = value;
    return;
  }
  attrs.push([name, value]);
};
var setFlagAttr = (attrs, name, present) => {
  const at = attrs.findIndex(([attrName]) => attrName === name);
  if (!present) {
    if (at >= 0) attrs.splice(at, 1);
    return;
  }
  if (at < 0) attrs.push([name, null]);
};
var hide = (attrs) => {
  const found = attrs.find(([name]) => name === "style");
  if (!found || found[1] === null || found[1].trim() === "") {
    setAttr(attrs, "style", HIDDEN_STYLE);
    return;
  }
  const current = found[1].trim();
  found[1] = current.endsWith(";") ? `${current} ${HIDDEN_STYLE}` : `${current}; ${HIDDEN_STYLE}`;
};
var applySync = (frame, node, attrs, sync, scope) => {
  const path = sync.value;
  const value = path.startsWith(GLOBAL_PREFIX) ? resolve(path.slice(GLOBAL_PREFIX.length), frame.ctx.globals) : resolve(path, scope);
  const type = String(attrValue(node, "type") || "").toLowerCase();
  if (type === "checkbox") {
    setFlagAttr(attrs, "checked", !!value);
    return;
  }
  if (type === "radio") {
    const own = attrValue(node, "value");
    const selected = value !== void 0 && value !== null && String(value) === (own === void 0 || own === null ? "" : own);
    setFlagAttr(attrs, "checked", selected);
    return;
  }
  if (node.tag === "textarea") return;
  setAttr(attrs, "value", escapeAttr(asText(value)));
};
var renderAttributes = (frame, node, scope) => {
  const attrs = node.attrs.map(([name, value]) => [
    name,
    value === null ? null : interpolate(frame, value, scope, escapeAttr)
  ]);
  if (!bindsAsProp(node.tag)) {
    node.attrs.forEach(([name, value]) => {
      if (name[0] !== ":" || name.length === 1) return;
      const attrName = name.slice(1);
      const text2 = boundAttrText(attrName, evaluate(frame, value === null ? "" : value, scope));
      if (text2 === null) setFlagAttr(attrs, attrName, false);
      else setAttr(attrs, attrName, text2 === "" ? null : escapeAttr(text2));
    });
  }
  const show = findAttr(node, "b-show");
  if (show && !truthy(frame, show.value, scope)) hide(attrs);
  const sync = findAttr(node, "b-sync");
  if (sync) applySync(frame, node, attrs, sync, scope);
  return attrs;
};
var renderChildren = (frame, nodes, scope) => nodes.map((node) => renderNode(frame, node, scope)).join("");
var renderText = (frame, node, scope) => {
  if (node.raw) return interpolate(frame, node.value, scope, asText);
  return interpolate(frame, node.value, scope, escapeText);
};
function renderNode(frame, node, scope) {
  if (node.type === "text") return renderText(frame, node, scope);
  if (node.type === "comment") return `<!--${node.value}-->`;
  return renderElement(frame, node, scope);
}
function renderElement(frame, node, scope) {
  const cond = findAttr(node, "b-if");
  if (cond && !truthy(frame, cond.value, scope)) return `<!--b-if: ${cond.value}-->`;
  const loop = findAttr(node, "b-for");
  const parsed = loop ? loop.value.match(FOR_SYNTAX) : null;
  if (parsed) return renderFor(frame, node, scope, parsed);
  return renderResolved(frame, node, scope);
}
function renderResolved(frame, node, scope) {
  if (frame.light && node.tag === "slot") return renderSlot(frame, node, scope);
  const def = frame.ctx.definitions.get(node.tag);
  if (def) return renderNested(frame, node, scope, def);
  return renderPlain(frame, node, scope);
}
var rowKey = (item, index, keyPath) => {
  if (keyPath) {
    const resolved = resolve(keyPath, item);
    if (resolved === null || resolved === void 0 || resolved === "") return `__bfor_${index}`;
    return String(resolved);
  }
  if (item && typeof item === "object") {
    const detected = item.id || item._id || item.uuid || item.key;
    return detected === void 0 ? String(index) : String(detected);
  }
  return `${index}-${item}`;
};
function renderFor(frame, node, scope, parsed) {
  const itemName = parsed[1];
  const listName = parsed[2].trim();
  const keyPath = attrValue(node, "b-key") || null;
  const list = evaluate(frame, listName, scope) || [];
  if (typeof list.forEach !== "function") {
    throw blockError(frame, `b-for list "${truncate(listName)}" is not iterable`);
  }
  const rows = [];
  list.forEach((item, index) => {
    const rowScope = Object.create(scope);
    rowScope[itemName] = item;
    rowScope.$index = index;
    const rowNode = {
      type: "el",
      tag: node.tag,
      attrs: node.attrs.concat([["data-b-key", escapeAttr(rowKey(item, index, keyPath))]]),
      children: node.children
    };
    rows.push(renderResolved(frame, rowNode, rowScope));
  });
  return `<!--b-for: ${itemName} in ${listName}-->${rows.join("")}`;
}
function renderSlot(frame, node, scope) {
  const name = attrValue(node, "name") || "";
  const provided = name ? frame.slots.named.get(name) : frame.slots.default;
  if (provided) return provided;
  return renderChildren(frame, node.children, scope);
}
function elementContent(frame, node, scope) {
  const mount = findAttr(node, "b-mount");
  if (mount) return renderMount(frame, mount, scope);
  const html = findAttr(node, "b-html");
  if (html) {
    const raw = asText(evaluate(frame, html.value, scope));
    if (!html.modifiers.includes("safe")) return raw;
    return frame.ctx.sanitize(raw, frame.name);
  }
  const text2 = findAttr(node, "b-text");
  if (text2) {
    const path = text2.value;
    const value = path.startsWith(GLOBAL_PREFIX) ? resolve(path.slice(GLOBAL_PREFIX.length), frame.ctx.globals) : resolve(path, scope);
    return escapeText(asText(value));
  }
  const sync = findAttr(node, "b-sync");
  if (sync && node.tag === "textarea") {
    const path = sync.value;
    const value = path.startsWith(GLOBAL_PREFIX) ? resolve(path.slice(GLOBAL_PREFIX.length), frame.ctx.globals) : resolve(path, scope);
    return escapeText(asText(value));
  }
  return renderChildren(frame, node.children, scope);
}
function renderMount(frame, mount, scope) {
  const result = evaluate(frame, mount.value, scope);
  if (!result) return "";
  const tag = String(result).toLowerCase();
  const def = frame.ctx.definitions.get(tag);
  if (!def) return "";
  return renderHost(frame.ctx, tag, def, {}, emptySlots(), [], frame.depth + 1);
}
function renderPlain(frame, node, scope) {
  const attrs = renderAttributes(frame, node, scope);
  const open = `<${node.tag}${serializeAttrs(attrs)}>`;
  if (VOID_ELEMENTS.has(node.tag)) return open;
  return `${open}${elementContent(frame, node, scope)}</${node.tag}>`;
}
var emptySlots = () => ({ all: "", default: "", named: /* @__PURE__ */ new Map() });
var kebabToCamel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
var camelToKebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
var parseLogicAttr = (frame, raw, scope) => {
  const { ctx } = frame;
  if (!raw || raw.trim() === "{}") return {};
  if (raw.includes(ctx.delimiterStart) && raw.includes(ctx.delimiterEnd)) {
    console.error(
      `[Lego SSR] <${frame.name}>: refusing to parse b-logic containing template delimiters. Pass values through state or a :prop instead. Got: "${truncate(raw)}"`
    );
    return {};
  }
  const logicCtx = { extra: ctx.globals, global: ctx.globals };
  const trimmed = raw.trim();
  const sources = trimmed.startsWith("{") || !trimmed.includes(":") ? [raw] : [raw, `{${raw}}`];
  let failure = null;
  for (const source of sources) {
    try {
      return compile(source)(scope, logicCtx);
    } catch (err) {
      if (failure === null) failure = err;
    }
  }
  console.error(`[Lego SSR] <${frame.name}>: error parsing b-logic "${truncate(raw)}"`, failure);
  return {};
};
var collectProps = (frame, node, scope, def) => {
  const props = {};
  const logicAttr = findAttr(node, "b-logic") || findAttr(node, "b-data");
  if (logicAttr) Object.assign(props, parseLogicAttr(frame, logicAttr.value, scope));
  def.propNames.forEach((propName) => {
    const raw = attrValue(node, propName) ?? attrValue(node, camelToKebab(propName));
    if (raw === void 0 || raw === null) return;
    props[propName] = interpolate(frame, raw, scope, asText);
  });
  node.attrs.forEach(([name, value]) => {
    if (!name.startsWith(":") || name.length === 1) return;
    props[kebabToCamel(name.slice(1))] = evaluate(frame, value === null ? "" : value, scope);
  });
  return props;
};
var collectSlots = (frame, node, scope) => {
  const rendered = node.children.map((child) => renderNode(frame, child, scope));
  const named = /* @__PURE__ */ new Map();
  let fallback = "";
  node.children.forEach((child, index) => {
    const html = rendered[index];
    const name = child.type === "el" ? attrValue(child, "slot") : void 0;
    if (!name) {
      fallback += html;
      return;
    }
    named.set(name, (named.get(name) || "") + html);
  });
  return { all: rendered.join(""), default: fallback, named };
};
var hostAttributes = (attrs, tagName) => {
  const out = attrs.slice();
  if (!out.some(([name]) => name === "b-hydrate")) out.push(["b-hydrate", null]);
  if (!out.some(([name]) => name === "b-id")) out.push(["b-id", tagName]);
  return out;
};
function renderNested(frame, node, scope, def) {
  const attrs = renderAttributes(frame, node, scope);
  const depth = frame.depth + 1;
  if (depth > MAX_BLOCK_DEPTH) {
    return `<${node.tag}${serializeAttrs(hostAttributes(attrs, node.tag))}></${node.tag}>`;
  }
  const props = collectProps(frame, node, scope, def);
  const slots = collectSlots(frame, node, scope);
  return renderHost(frame.ctx, node.tag, def, props, slots, attrs, depth);
}
function renderHost(ctx, tagName, def, props, slots, hostAttrs, depth) {
  const state = buildState(def.logic, props, def.propDefaults);
  const frame = {
    ctx,
    name: tagName,
    state,
    slots,
    depth,
    light: !def.shadow
  };
  const body = renderChildren(frame, def.nodes, state);
  const open = `<${tagName}${serializeAttrs(hostAttributes(hostAttrs, tagName))}>`;
  const style = def.css ? `<style${def.styleAttrs}>${def.css}</style>` : "";
  if (frame.light) return `${open}${style}${body}</${tagName}>`;
  return `${open}<template shadowrootmode="open">${style}${body}</template>${slots.all}</${tagName}>`;
}

// src/server/index.js
var DELIMITERS = { brackets: ["[[", "]]"], mustache: ["{{", "}}"] };
var escapeForRegex = (raw) => raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
var delimitersFor = (syntax) => DELIMITERS[syntax] || DELIMITERS[config.syntax] || DELIMITERS.brackets;
var asText2 = (value) => value === void 0 || value === null ? "" : String(value);
var parsePropContract = (raw, tagName) => {
  if (Array.isArray(raw)) return { names: raw.slice(), defaults: [] };
  const declared = parseProps(raw, tagName);
  if (!declared) return { names: [], defaults: [] };
  return {
    names: declared.map((prop) => prop.name),
    // Booleans follow attribute semantics on the client: absent means false,
    // not undefined, so an undeclared default still has a value to render.
    defaults: declared.filter((prop) => prop.defaultFn || prop.type === "Boolean").map((prop) => ({ name: prop.name, get: prop.defaultFn || (() => false) }))
  };
};
var STYLE_MARKER = "data-lego-style";
var LEGO_TEMPLATE_TAG = /<template\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;
var SHADOW_ATTR = /b-shadow\s*=\s*["']?([^"'\s>]*)/i;
var shadowFromLegoSource = (source) => {
  const tag = source.match(LEGO_TEMPLATE_TAG);
  if (!tag) return true;
  const attr = tag[1].match(SHADOW_ATTR);
  return !attr || attr[1] !== "false";
};
var serverDb = () => ({ get: () => null });
var serverLego = { db: serverDb, globals: {}, config };
var evaluateScript = (script, blockName) => {
  if (!script) return {};
  try {
    return new Function("Lego", "$db", scriptFunctionBody(script))(serverLego, serverDb) || {};
  } catch (err) {
    throw new Error(
      `[Lego SSR] <${blockName}>: failed evaluating the script section: ${err.message}`,
      { cause: err }
    );
  }
};
var stampSlotName = (html, name, label) => {
  let nodes;
  try {
    nodes = parseHTML(html, label, { lenient: true });
  } catch (err) {
    return html;
  }
  return serialize(nodes.map((node) => {
    if (node.type !== "el") return node;
    if (node.attrs.some(([attrName]) => attrName === "slot")) return node;
    return { ...node, attrs: node.attrs.concat([["slot", escapeAttr(name)]]) };
  }));
};
var slotsFromOptions = (slots, label) => {
  const record = emptySlots();
  if (!slots) return record;
  const light = [];
  Object.keys(slots).forEach((key) => {
    const html = slots[key];
    if (typeof html !== "string" || html === "") return;
    if (key === "default") {
      record.default = html;
      light.unshift(html);
      return;
    }
    record.named.set(key, html);
    light.push(stampSlotName(html, key, label));
  });
  record.all = light.join("");
  return record;
};
var buildRoute = (route) => ({
  url: "/",
  route: "",
  method: "GET",
  body: null,
  ...route || {},
  params: route && route.params || {},
  query: route && route.query || {}
});
var createHelpers = (route) => ({
  $element: null,
  $ancestors: () => void 0,
  $registry: () => void 0,
  get $route() {
    return route;
  },
  get $params() {
    return route.params || {};
  },
  $go: () => {
  },
  $mount: () => void 0,
  $db: () => ({ get: () => null }),
  $emit: () => {
  }
});
function createRenderer(options = {}) {
  const definitions = /* @__PURE__ */ new Map();
  const [delimiterStart, delimiterEnd] = delimitersFor(options.syntax);
  const delimiterRe = new RegExp(
    `${escapeForRegex(delimiterStart)}(.*?)${escapeForRegex(delimiterEnd)}`,
    "g"
  );
  const sanitize = typeof options.sanitize === "function" ? options.sanitize : sanitizeHTML;
  const register = (tagName, definition) => {
    const tag = String(tagName).toLowerCase();
    if (!tag.includes("-")) {
      throw new Error(
        `[Lego SSR] Invalid block name "${tagName}". Block names must contain a hyphen, the same rule custom elements follow.`
      );
    }
    const template = definition.template || "";
    const shadow = definition.shadow !== false;
    const styles = definition.styles || "";
    const propContract = parsePropContract(definition.props, tag);
    definitions.set(tag, {
      name: tag,
      template,
      nodes: parseHTML(template, tag),
      logic: definition.logic || {},
      shadow,
      propNames: propContract.names,
      propDefaults: propContract.defaults,
      css: scopeStyles(styles, tag, shadow),
      // A shadow block's style is already encapsulated and needs no marker.
      styleAttrs: shadow ? "" : ` ${STYLE_MARKER}="${escapeAttr(tag)}"`
    });
    return tag;
  };
  const defineAll = (source) => {
    if (!source) return renderer;
    if (typeof source.getDefinitions === "function") return defineAll(source.getDefinitions());
    const entries = source instanceof Map ? [...source.entries()] : Object.entries(source);
    entries.forEach(([tagName, definition]) => renderer.define(tagName, definition));
    return renderer;
  };
  const renderer = {
    /**
     * Register a block.
     *
     * @param {string} tagName - the custom element name, hyphen required
     * @param {object} definition
     * @param {string} definition.template - the block's markup
     * @param {object} [definition.logic] - state, getters and methods
     * @param {string} [definition.styles] - CSS text for the block's <style>
     * @param {boolean} [definition.shadow=true] - false renders light DOM
     * @param {string|string[]} [definition.props] - declared prop names
     */
    define(tagName, definition = {}) {
      register(tagName, definition);
      return renderer;
    },
    /**
     * Register a block from .lego source. The template, style and script
     * sections are split by the same `parseLego` the client and the Vite
     * plugin use, and the script's default export is evaluated.
     *
     * @param {string} source - .lego file contents
     * @param {string} [filename] - used to derive the block name
     */
    defineLegoFile(source, filename = "block.lego") {
      const parsed = parseLego(source, filename);
      const blockName = parsed.blockName;
      register(blockName, {
        template: parsed.template,
        logic: evaluateScript(parsed.script, blockName),
        styles: parsed.style,
        props: parsed.propsAttr,
        shadow: shadowFromLegoSource(source)
      });
      return renderer;
    },
    /**
     * Register every block a definitions source holds. See the `definitions`
     * option on createRenderer for the shapes accepted.
     *
     * @param {object} source - an app, `app.getDefinitions()`, a Map, or a
     *   plain `{ tagName: definition }` object
     */
    defineFrom(source) {
      return defineAll(source);
    },
    /** Whether a block is registered under this name. */
    has(tagName) {
      return definitions.has(String(tagName).toLowerCase());
    },
    /** Every registered block name. */
    names() {
      return [...definitions.keys()];
    },
    /**
     * Render one block to an HTML string.
     *
     * @param {string} tagName - a registered block name
     * @param {object} [renderOptions]
     * @param {object} [renderOptions.props] - layered over the block's logic
     * @param {object} [renderOptions.globals] - what templates read as `global`
     * @param {object} [renderOptions.route] - what `$route` and `$params` return
     * @param {Record<string,string>} [renderOptions.slots] - slot content, as HTML
     * @param {Record<string,string|boolean>} [renderOptions.attrs] - extra host attributes
     * @returns {string} HTML
     */
    renderToString(tagName, renderOptions = {}) {
      const tag = String(tagName).toLowerCase();
      const definition = definitions.get(tag);
      if (!definition) {
        throw new Error(
          `[Lego SSR] No block registered as "${tag}". Call define() or defineLegoFile() before rendering it.`
        );
      }
      const route = buildRoute(renderOptions.route);
      const ctx = {
        definitions,
        globals: renderOptions.globals || {},
        route,
        helpers: createHelpers(route),
        delimiterStart,
        delimiterEnd,
        delimiterRe,
        sanitize
      };
      const hostAttrs = Object.entries(renderOptions.attrs || {}).map(([name, value]) => value === true || value === null ? [name, null] : [name, escapeAttr(asText2(value))]);
      const startDepth = 1;
      return renderHost(
        ctx,
        tag,
        definition,
        renderOptions.props || {},
        slotsFromOptions(renderOptions.slots, tag),
        hostAttrs,
        startDepth
      );
    }
  };
  defineAll(options.definitions);
  return renderer;
}
var index_default = { createRenderer, MAX_BLOCK_DEPTH };
export {
  MAX_BLOCK_DEPTH,
  createRenderer,
  index_default as default
};
