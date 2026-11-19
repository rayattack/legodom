import { deriveBlockName } from './helpers.js';
export { deriveBlockName };

/**
 * Parser for .lego Single File Blocks (SFB)
 * Extracts template, script, and style sections from .lego files
 */

/**
 * Read one attribute value out of a section's attribute text.
 *
 * The delimiter has to be captured and matched, not treated as a character
 * class: `b-props="title: String = 'Untitled'"` and
 * `args="{ title: 'Fetching' }"` both carry the other quote inside the value,
 * and a `["']([^"']*)["']` pattern truncates them at the first inner quote.
 *
 * @param {string} attrs - the raw attribute text of a section's start tag
 * @param {string} name - the attribute to read
 * @returns {?string} the value, or null when the attribute is absent
 */
const readAttr = (attrs, name) => {
  const match = attrs.match(new RegExp(`(?:^|\\s)${name}=(?:"([^"]*)"|'([^']*)')`, 'i'));
  if (!match) return null;
  return match[1] !== undefined ? match[1] : match[2];
};

/**
 * Parse a .lego file content into structured sections
 * @param {string} content - Raw .lego file content
 * @param {string} filename - Filename for error reporting
 * @returns {{template: string, script: string, style: string, stylesAttr: string, cascadeAttr: string, errorAttr: string, propsAttr: string, shadowAttr: string, formAttr: boolean, blockName: string}}
 */
export function parseLego(content, filename = 'block.lego') {
  const result = {
    template: '',
    script: '',
    style: '',
    stylesAttr: '',
    cascadeAttr: '',
    errorAttr: '',
    propsAttr: '',
    shadowAttr: '',
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

  // Regex to match the start tag of a section, handling attributes with quotes correctly
  // <(template|script|style) matches the tag name
  // \b ensures we don't match templates inside "template-foo"
  // (?: ... )* loops over attributes
  // \s+ requires space before attributes
  // (?:[^>"']|"[^"]*"|'[^']*')* matches attribute content, respecting quotes to skip >
  const startTagRegex = /<(template|script|style|story)\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;

  while (remaining) {
    const match = remaining.match(startTagRegex);
    if (!match) break;

    const tagName = match[1].toLowerCase();
    const attrs = match[2]; // Captures all attributes
    const fullMatch = match[0];
    const startIndex = match.index;

    // Find the corresponding closing tag
    const closeTag = `</${tagName}>`;

    // Content starts after the opening tag
    const contentStart = startIndex + fullMatch.length;

    // Find the closing tag starting from where content began
    const contentEnd = remaining.indexOf(closeTag, contentStart);

    if (contentEnd === -1) {
      // If no closing tag found, we can't safely parse this block
      console.warn(`[Lego] Unclosed <${tagName}> tag in ${filename}`);
      break;
    }

    const innerContent = remaining.slice(contentStart, contentEnd);

    if (tagName === 'template') {
      result.hasTemplate = true;
      result.template = innerContent.trim();
      const bStyles = readAttr(attrs, 'b-stylesheets');
      if (bStyles) result.stylesAttr = bStyles;

      const bCascade = readAttr(attrs, 'b-cascade');
      if (bCascade) result.cascadeAttr = bCascade;

      const bError = readAttr(attrs, 'b-error');
      if (bError) result.errorAttr = bError;

      const bProps = readAttr(attrs, 'b-props');
      if (bProps) result.propsAttr = bProps;

      // b-shadow="false" opts the block out of Shadow DOM. An empty value is
      // meaningful here, so this one checks for null rather than truthiness.
      const bShadow = readAttr(attrs, 'b-shadow');
      if (bShadow !== null) result.shadowAttr = bShadow;
      // b-form is a boolean attribute: present means form associated, unless
      // it was spelled out as "false".
      const bFormMatch = attrs.match(/(?:^|\s)b-form(?:=["']([^"']*)["'])?(?=\s|$)/);
      if (bFormMatch) {
        result.formAttr = bFormMatch[1] !== 'false';
      }
    } else if (tagName === 'script') {
      result.hasScript = true;
      result.script = innerContent.trim();
      const lang = readAttr(attrs, 'lang');
      if (lang) result.scriptLang = lang;
    } else if (tagName === 'style') {
      result.hasStyle = true;
      result.style = innerContent.trim();
    } else if (tagName === 'story') {
      // <story name="Loading" args="{ loading: true }"> slot html </story>
      const storyName = readAttr(attrs, 'name');
      result.stories.push({
        name: (storyName && storyName.trim()) || `Story ${result.stories.length + 1}`,
        args: (readAttr(attrs, 'args') || '').trim(),
        globals: (readAttr(attrs, 'globals') || '').trim(),
        slotHTML: innerContent.trim()
      });
    }

    // Advance past this block (content + closing tag)
    remaining = remaining.slice(contentEnd + closeTag.length);
  }

  return result;
}



/* ------------------------------------------------------------------ *
 * Script sections
 *
 * A `.lego` script section is module code: imports, top-level helpers and
 * constants, and one `export default` object that becomes the block's logic.
 * The Vite plugin emits it as a real module (scriptModule). The runtime
 * loader, the server's defineLegoFile and Lego Studio's plain path have no
 * module system, so they run it as a function body (scriptFunctionBody):
 * top-level code still works there, and an `import` is a loud error rather
 * than something silently dropped.
 *
 * Two names are provided to every script without an import: `Lego` (the app)
 * and `$db`. A script that declares either itself keeps its own.
 * ------------------------------------------------------------------ */

/** The binding a script's default export is rebound to. */
export const SCRIPT_LOGIC = '__lego_logic';

const DEFAULT_EXPORT_AT = /(^|\n)([ \t]*)export\s+default\s+/;
const HAS_DEFAULT_EXPORT = /\bexport\s+default\s+/;
const DEFAULT_SPECIFIER = /(^|\n)[ \t]*export\s*\{\s*([\w$]+)\s+as\s+default\s*,?\s*\}\s*;?/;
// `import x from`, `import { x }`, `import * as x`, `import 'side-effect'`.
// Not `import(` (dynamic import) and not `import.meta`.
const IMPORT_AT = /(^|\n)[ \t]*import\s*(?:[\w$*{]|['"])/;
const NAMED_EXPORT_AT = /(^|\n)([ \t]*)export\s+(?=(?:const|let|var|function|class|async\s+function)\b)/g;

export const IMPORTS_NEED_BUNDLER =
  '`import` in a .lego script needs the Vite plugin (or another bundler). ' +
  'This script is evaluated without one, so it has to be self-contained: ' +
  'top-level helpers and constants are fine, imports are not.';

/** Whether a script section has a static import declaration. */
export const scriptHasImports = (script) => IMPORT_AT.test(script || '');

const escapeName = (name) => name.replace(/\$/g, '\\$');

/** Text fallback for `declaresName` when no parser is at hand. */
const declaresByText = (source, name) => {
  const id = escapeName(name);
  const imported = new RegExp(`\\bimport\\b[^;]*?[{,\\s]${id}\\s*(?:[,}]|\\bfrom\\b)`).test(source);
  const declared = new RegExp(`(?:^|[\\n;])\\s*(?:export\\s+)?(?:const|let|var|function\\*?|class)\\s+${id}\\b`).test(source);
  return imported || declared;
};

const patternNames = (node, out) => {
  if (!node) return;
  if (node.type === 'Identifier') out.add(node.name);
  else if (node.type === 'ObjectPattern') {
    node.properties.forEach(p => patternNames(p.type === 'RestElement' ? p.argument : p.value, out));
  } else if (node.type === 'ArrayPattern') node.elements.forEach(e => patternNames(e, out));
  else if (node.type === 'RestElement') patternNames(node.argument, out);
  else if (node.type === 'AssignmentPattern') patternNames(node.left, out);
};

/** Every name an ESTree Program binds at its top level. */
const topLevelNames = (program) => {
  const out = new Set();
  for (let node of program.body) {
    if (node.type === 'ExportNamedDeclaration' && node.declaration) node = node.declaration;
    if (node.type === 'ImportDeclaration') node.specifiers.forEach(s => out.add(s.local.name));
    else if (node.type === 'VariableDeclaration') node.declarations.forEach(d => patternNames(d.id, out));
    else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) out.add(node.id.name);
  }
  return out;
};

/**
 * Where the default export starts, and where its value starts. The AST is
 * preferred, but its offsets are checked against the text before they are
 * trusted: a parser reporting byte offsets would otherwise cut a script with
 * non-ASCII text before the export in the wrong place.
 */
const defaultExportSpan = (source, program) => {
  const node = program && program.body.find(n => n.type === 'ExportDefaultDeclaration');
  if (node && source.startsWith('export', node.start) && node.declaration && node.declaration.start > node.start) {
    return { start: node.start, value: node.declaration.start };
  }
  const match = DEFAULT_EXPORT_AT.exec(source);
  if (match) return { start: match.index + match[1].length + match[2].length, value: match.index + match[0].length };
  const loose = HAS_DEFAULT_EXPORT.exec(source);
  return loose ? { start: loose.index, value: loose.index + loose[0].length } : null;
};

/**
 * Module code for a script section, for the Vite plugin.
 *
 * Everything the author wrote is kept. Only the default export changes: it is
 * rebound to `SCRIPT_LOGIC`, because the module's own default export is the
 * block's tag name. A script written as a bare object literal (the original
 * format) has no module code and is used as the logic expression directly.
 *
 * @param {string} script - the script section, already compiled from TypeScript
 * @param {?function} [parse] - an ESTree parser, such as a Vite plugin's `this.parse`
 * @returns {{code: string, logic: string, declares: (name: string) => boolean}}
 */
export function scriptModule(script, parse = null) {
  const source = (script || '').trim();
  if (!source) return { code: '', logic: '{}', declares: () => false };

  // `const logic = {…}; export { logic as default };` names its logic already.
  const specifier = !HAS_DEFAULT_EXPORT.test(source) && DEFAULT_SPECIFIER.exec(source);
  if (specifier) {
    const code = source.slice(0, specifier.index) + specifier[1] + source.slice(specifier.index + specifier[0].length);
    const program = parse ? parse(source) : null;
    const names = program ? topLevelNames(program) : null;
    return { code, logic: specifier[2], declares: (name) => (names ? names.has(name) : declaresByText(source, name)) };
  }

  // Decided from the text, before any parsing: the original bare object
  // format is not valid module code, so handing it to a parser would fail.
  if (!HAS_DEFAULT_EXPORT.test(source)) {
    if (scriptHasImports(source)) {
      throw new Error('a script section with imports needs an `export default { … }` holding the block logic');
    }
    return { code: '', logic: `(${source})`, declares: () => false };
  }

  const program = parse ? parse(source) : null;
  const names = program ? topLevelNames(program) : null;
  const declares = (name) => (names ? names.has(name) : declaresByText(source, name));

  const span = defaultExportSpan(source, program);
  const code = `${source.slice(0, span.start)}const ${SCRIPT_LOGIC} = ${source.slice(span.value)}`;
  return { code, logic: SCRIPT_LOGIC, declares };
}

/**
 * A function body that evaluates a script section and returns its logic
 * object, for the paths with no module system. Call it as
 * `new Function('Lego', '$db', body)(app, db)`.
 *
 * The script's top level runs in an inner function, so a script that declares
 * `Lego` or `$db` itself shadows the parameter instead of colliding with it.
 * Named `export` keywords are dropped, since a function body cannot export.
 *
 * @throws {Error} IMPORTS_NEED_BUNDLER when the script has an import declaration
 */
export function scriptFunctionBody(script) {
  const source = (script || '').trim();
  if (!source) return 'return {};';
  if (scriptHasImports(source)) throw new Error(IMPORTS_NEED_BUNDLER);
  const { code, logic } = scriptModule(source);
  if (!code) return `return ${logic};`;
  return `return (() => {\n${code.replace(NAMED_EXPORT_AT, '$1$2')}\n;return ${logic};\n})();`;
}

/**
 * Generate Lego.block() code from parsed .lego file
 * @param {object} parsed - Parsed .lego file object
 * @param {object} [options]
 * @param {string} [options.logic] - the logic expression to pass. Without it
 *   the default export's object literal is lifted out of the script text,
 *   which drops everything else the script declares; the Vite plugin passes
 *   the binding from scriptModule() instead.
 * @param {string} [options.app='Lego'] - the identifier `.block()` is called on
 * @returns {string} - JavaScript code string
 */
export function generateBlockCall(parsed, { logic, app = 'Lego' } = {}) {
  const { blockName, template, script, style, stylesAttr, cascadeAttr, errorAttr, propsAttr, shadowAttr, formAttr } = parsed;

  // Build template HTML
  let templateHTML = '';
  if (style) {
    templateHTML += `<style>${style}</style>\n`;
  }
  if (template) {
    templateHTML += template;
  }

  // Extract logic object from script
  let logicCode = logic === undefined ? '{}' : logic;
  if (logic === undefined && script) {
    // Try to extract default export
    // Allow optional block/line comments between `default` and `{`
    const defaultExportMatch = script.match(/export\s+default\s+(?:\/\*[\s\S]*?\*\/\s*|\/\/[^\n]*\n\s*)*({[\s\S]*})/);
    if (defaultExportMatch) {
      logicCode = defaultExportMatch[1];
    } else {
      // If no export default, assume entire script is the logic object
      logicCode = script;
    }
  }

  // Generate the Lego.block call. The options form is used because the block
  // contract now has more knobs than a positional list can carry readably,
  // and because a build artefact should name what it is passing.
  return [
    `${app}.block('${blockName}', {`,
    `  template: \`${escapeTemplate(templateHTML)}\`,`,
    `  logic: ${logicCode},`,
    `  styles: ${JSON.stringify(stylesAttr || '')},`,
    `  cascade: ${JSON.stringify(cascadeAttr || '')},`,
    `  error: ${JSON.stringify(errorAttr || '')},`,
    `  props: ${JSON.stringify(propsAttr || '')},`,
    `  shadow: ${shadowAttr !== 'false'},`,
    `  form: ${formAttr === true}`,
    `});`
  ].join('\n');
}

/**
 * Escape backticks and ${} in template strings
 * @param {string} str
 * @returns {string}
 */
function escapeTemplate(str) {
  return str.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}

/**
 * Validate .lego file structure
 * @param {object} parsed - Parsed .lego file object
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateLego(parsed) {
  const errors = [];

  if (!parsed.hasTemplate && !parsed.hasScript && !parsed.hasStyle) {
    errors.push('Block must have at least one section: <template>, <script>, or <style>');
  }

  if (!parsed.blockName) {
    errors.push('Unable to derive block name from filename');
  }

  if (parsed.blockName && !/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(parsed.blockName)) {
    errors.push(`Block name "${parsed.blockName}" must be kebab-case with at least one hyphen (e.g., "my-block")`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}