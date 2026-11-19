/**
 * Argument parsing for the `lego-studio` CLI.
 *
 * Deliberately hand written rather than a dependency: the studio ships inside
 * lego-dom, which keeps a zero runtime dependency promise, and the surface a
 * dev tool needs is small enough to fit in one readable file.
 *
 * The shape returned is `{ _: [positionals], ...flags }`, which is what every
 * subcommand's `run(flags)` receives.
 */

// Short forms worth having. Anything else is left alone so a typo surfaces as
// an unknown flag rather than silently becoming something else.
const SHORT = {
  p: 'port',
  h: 'help',
  r: 'root'
};

// Flags that name a glob or a path may be repeated. Everything else keeps the
// last value written, which is the least surprising behaviour for `--port`.
const isNumeric = (value) => /^-?\d+(?:\.\d+)?$/.test(value);

const coerce = (value) => {
  if (typeof value !== 'string') return value;
  if (value === '') return '';
  return isNumeric(value) ? Number(value) : value;
};

// `--out-dir` reads as `outDir` on the flags object. Single word flags pass
// through untouched, which is all of the common ones.
const camel = (key) => key.replace(/-([a-z0-9])/g, (_, ch) => ch.toUpperCase());

/**
 * Repeating a flag collects it into an array instead of overwriting. That is
 * what makes `--include a --include b` mean both globs.
 */
const assign = (out, key, value) => {
  if (!Object.prototype.hasOwnProperty.call(out, key)) {
    out[key] = value;
    return;
  }
  const existing = out[key];
  out[key] = Array.isArray(existing) ? existing.concat(value) : [existing, value];
};

/**
 * Parse an argv tail (already sliced past node and the script path).
 *
 * Supported forms: `--key=value`, `--key value`, `--bool`, `--no-bool`,
 * `-p 3000`, `-p=3000`, and a bare `--` after which everything is positional.
 *
 * @param {string[]} argv
 * @returns {{_: string[]} & Record<string, *>}
 */
export function parseFlags(argv = []) {
  const out = { _: [] };
  const args = Array.isArray(argv) ? argv : [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg !== 'string') continue;

    if (arg === '--') {
      out._.push(...args.slice(i + 1));
      break;
    }

    if (arg.startsWith('--')) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');

      if (eq !== -1) {
        assign(out, camel(body.slice(0, eq)), coerce(body.slice(eq + 1)));
        continue;
      }

      // `--no-thing` is the only place a prefix changes meaning, so it is
      // checked before the generic boolean case.
      if (body.startsWith('no-') && body.length > 3) {
        assign(out, camel(body.slice(3)), false);
        continue;
      }

      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        assign(out, camel(body), coerce(next));
        i++;
        continue;
      }

      assign(out, camel(body), true);
      continue;
    }

    if (arg.startsWith('-') && arg.length > 1) {
      const body = arg.slice(1);
      const eq = body.indexOf('=');
      const letter = eq === -1 ? body : body.slice(0, eq);
      const key = SHORT[letter] || camel(letter);

      if (eq !== -1) {
        assign(out, key, coerce(body.slice(eq + 1)));
        continue;
      }

      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('-')) {
        assign(out, key, coerce(next));
        i++;
        continue;
      }

      assign(out, key, true);
      continue;
    }

    out._.push(arg);
  }

  return out;
}

export default parseFlags;
