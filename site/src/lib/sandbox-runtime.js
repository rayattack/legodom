/*
 * The script that runs inside the preview iframe of the docs editor.
 *
 * It is shipped as text (imported with ?raw and inlined into the iframe's
 * srcdoc), so it must stay a plain script: no imports, no build step, ES2017.
 * tests/learn-lessons.test.js evaluates this same file in JSDOM, which is what
 * keeps every lesson honest against the current build of the library.
 *
 * Page order inside the iframe:
 *   1. window.__LEGO_PROJECT__ = { files, storage, token }
 *   2. this file      (console capture, error capture, storage shim)
 *   3. lego.min.js
 *   4. __legoSandbox.boot()
 */
(function () {
  var project = window.__LEGO_PROJECT__ || { files: {} };
  // __LEGO_HOST__ lets the lesson tests listen in without an iframe.
  var host = window.__LEGO_HOST__ || (window.parent && window.parent !== window ? window.parent : null);

  function send(type, payload) {
    if (!host) return;
    var msg = { source: 'lego-sandbox', token: project.token, type: type };
    for (var k in payload) msg[k] = payload[k];
    try { host.postMessage(msg, '*'); } catch (e) { /* unserialisable payload */ }
  }

  // ---- formatting -------------------------------------------------------

  function plain(value, depth, seen) {
    if (value === null || typeof value !== 'object') {
      if (typeof value === 'function') return undefined;
      if (typeof value === 'bigint') return String(value) + 'n';
      return value;
    }
    if (seen.indexOf(value) !== -1) return '[circular]';
    if (depth > 6) return Array.isArray(value) ? '[…]' : '{…}';
    if (typeof Node !== 'undefined' && value instanceof Node) return '<' + (value.nodeName || 'node').toLowerCase() + '>';
    if (value instanceof Date) return value.toISOString();
    seen = seen.concat([value]);
    if (Array.isArray(value)) {
      return value.slice(0, 200).map(function (v) {
        var out = plain(v, depth + 1, seen);
        return out === undefined ? null : out;
      });
    }
    var out = {};
    Object.keys(value).forEach(function (key) {
      if (key.charAt(0) === '$') return;
      var v;
      try { v = plain(value[key], depth + 1, seen); } catch (e) { v = '[threw]'; }
      if (v !== undefined) out[key] = v;
    });
    return out;
  }

  function format(arg) {
    if (typeof arg === 'string') return arg;
    if (arg instanceof Error) return arg.message || String(arg);
    if (typeof arg === 'function') return '[function ' + (arg.name || 'anonymous') + ']';
    if (arg === undefined) return 'undefined';
    try { return JSON.stringify(plain(arg, 0, [])); } catch (e) { return String(arg); }
  }

  // ---- console and errors ----------------------------------------------

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (level) {
    var original = console[level];
    console[level] = function () {
      var args = Array.prototype.slice.call(arguments);
      send('console', { level: level === 'debug' ? 'log' : level, text: args.map(format).join(' ') });
      if (original) original.apply(console, args);
    };
  });

  function reportError(err, where) {
    var message = err && err.message ? err.message : String(err);
    send('error', { message: message, where: where || '' });
  }

  window.addEventListener('error', function (e) {
    reportError(e.error || e.message, 'runtime');
  });
  window.addEventListener('unhandledrejection', function (e) {
    reportError(e.reason, 'promise');
  });

  // ---- localStorage ------------------------------------------------------
  // The iframe is sandboxed without allow-same-origin, so the real
  // localStorage throws. $db gets an in-memory stand-in whose contents the
  // parent page keeps between runs, so "it survives a reload" is still true.

  var store = {};
  var seed = project.storage || {};
  Object.keys(seed).forEach(function (k) { store[k] = String(seed[k]); });

  function syncStorage() { send('storage', { data: store }); }

  var memoryStorage = {
    getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
    setItem: function (k, v) { store[k] = String(v); syncStorage(); },
    removeItem: function (k) { delete store[k]; syncStorage(); },
    clear: function () { store = {}; syncStorage(); },
    key: function (i) { return Object.keys(store)[i] || null; }
  };
  Object.defineProperty(memoryStorage, 'length', { get: function () { return Object.keys(store).length; } });
  try {
    Object.defineProperty(window, 'localStorage', { configurable: true, get: function () { return memoryStorage; } });
  } catch (e) { /* leave the platform's own */ }

  // ---- state inspector ---------------------------------------------------

  function collectBlocks(root, out) {
    var nodes = root.querySelectorAll('*');
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var tag = el.tagName.toLowerCase();
      if (tag.indexOf('-') !== -1 && el.state && typeof el.state === 'object') {
        var snapshot;
        try { snapshot = plain(el.state, 0, []); } catch (e) { snapshot = {}; }
        out.push({ tag: tag, state: snapshot });
      }
      if (el.shadowRoot) collectBlocks(el.shadowRoot, out);
    }
    return out;
  }

  var lastState = '';
  function publishState() {
    var blocks = collectBlocks(document, []);
    var json;
    try { json = JSON.stringify(blocks); } catch (e) { return; }
    if (json === lastState) return;
    lastState = json;
    send('state', { blocks: blocks });
  }

  // ---- boot ----------------------------------------------------------------

  var IMPORT_LINE = /^\s*import\s+(?:[^'"\n]*?\s+from\s+)?['"][^'"\n]*['"]\s*;?[ \t]*$/gm;

  function runScript(code, label) {
    try {
      new Function('Lego', code.replace(IMPORT_LINE, ''))(window.Lego);
    } catch (e) {
      reportError(e, label);
    }
  }

  function boot() {
    var Lego = window.Lego;
    if (!Lego) { reportError(new Error('The LegoDOM runtime failed to load.'), 'sandbox'); return; }
    var files = project.files || {};
    var names = Object.keys(files);

    // Typos in a template surface as errors rather than silent blanks.
    Lego.config.strict = true;
    Lego.config.onError = function (err, type, where) {
      var label = typeof where === 'string' ? where : (where && where.tagName ? where.tagName.toLowerCase() : '');
      reportError(err, [type, label].filter(Boolean).join(' in '));
    };

    var legoFiles = names.filter(function (n) { return /\.lego$/.test(n); });
    var html = files['index.html'];
    if (html == null && legoFiles.length) {
      var first = legoFiles[0].replace(/^.*\//, '').replace(/\.lego$/, '');
      html = '<' + first + '></' + first + '>';
    }

    // Parse the page off-document first. innerHTML never runs scripts, so the
    // ones the page declared are collected and run by hand.
    var page = document.createElement('template');
    page.innerHTML = html || '';
    var scripts = [];
    Array.prototype.slice.call(page.content.querySelectorAll('script')).forEach(function (s) {
      if (!s.src && (!s.type || s.type === 'module' || s.type === 'text/javascript')) {
        scripts.push({ code: s.textContent, label: 'index.html' });
      }
      s.remove();
    });
    names.filter(function (n) { return /\.js$/.test(n); }).forEach(function (name) {
      scripts.push({ code: files[name], label: name });
    });

    // Order matters. In a real project the entry script sets up globals and
    // routes and then calls Lego.init(), and nothing mounts before that. So
    // the scripts run first with init() held back, then the blocks are
    // defined, then the page goes in, and init() runs last with whatever
    // arguments the script gave it.
    var realInit = Lego.init;
    var initArgs = [];
    Lego.init = function () { initArgs = arguments; return Promise.resolve(); };
    scripts.forEach(function (s) { runScript(s.code, s.label); });
    Lego.init = realInit;

    // Blocks are defined against an empty page, so that by the time any
    // element mounts every block it might contain is already known. A parent
    // only binds `:prop` on a child tag it recognises as a block.
    document.body.innerHTML = '';
    legoFiles.forEach(function (name) {
      var base = name.replace(/^.*\//, '');
      var tag = base.replace(/\.lego$/, '');
      if (!/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(tag)) {
        reportError(new Error('"' + base + '" is not a valid block name. Use kebab-case with a hyphen, like my-block.lego.'), 'file');
        return;
      }
      try { Lego.defineLegoFile(files[name], base); } catch (e) { reportError(e, base); }
    });

    document.body.appendChild(page.content);

    var started;
    try { started = realInit.apply(Lego, initArgs); } catch (e) { reportError(e, 'init'); }

    var ready = function () {
      send('ready', {});
      publishState();
      setInterval(publishState, 250);
    };
    if (started && typeof started.then === 'function') {
      started.then(ready, function (e) { reportError(e, 'init'); ready(); });
    } else {
      ready();
    }
  }

  window.__legoSandbox = { boot: boot, publishState: publishState };
})();
