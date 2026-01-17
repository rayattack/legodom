/**
 * Parser for .lego Single File Components
 * Extracts template, script, and style sections from .lego files
 */

/**
 * Parse a .lego file content into structured sections
 * @param {string} content - Raw .lego file content
 * @param {string} filename - Filename for error reporting
 * @returns {{template: string, script: string, style: string, stylesAttr: string, componentName: string}}
 */
export function parseLego(content, filename = 'component.lego') {
  const result = {
    template: '',
    script: '',
    style: '',
    stylesAttr: '',
    componentName: deriveComponentName(filename)
  };

  let remaining = content;

  // Regex to match the start tag of a section, handling attributes with quotes correctly
  // <(template|script|style) matches the tag name
  // \b ensures we don't match templates inside "template-foo"
  // (?: ... )* loops over attributes
  // \s+ requires space before attributes
  // (?:[^>"']|"[^"]*"|'[^']*')* matches attribute content, respecting quotes to skip >
  const startTagRegex = /<(template|script|style)\b((?:\s+(?:[^>"']|"[^"]*"|'[^']*')*)*)>/i;

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
      result.template = innerContent.trim();
      // Extract b-stylesheets attribute if present
      const bStylesMatch = attrs.match(/b-stylesheets=["']([^"']+)["']/);
      if (bStylesMatch) {
        result.stylesAttr = bStylesMatch[1];
      }
    } else if (tagName === 'script') {
      result.script = innerContent.trim();
    } else if (tagName === 'style') {
      result.style = innerContent.trim();
    }

    // Advance past this block (content + closing tag)
    remaining = remaining.slice(contentEnd + closeTag.length);
  }

  return result;
}

/**
 * Derive component name from filename
 * e.g., "sample-component.lego" -> "sample-component"
 * @param {string} filename
 * @returns {string}
 */
export function deriveComponentName(filename) {
  const basename = filename.split('/').pop();
  return basename.replace(/\.lego$/, '');
}

/**
 * Generate Lego.define() code from parsed .lego file
 * @param {object} parsed - Parsed .lego file object
 * @returns {string} - JavaScript code string
 */
export function generateDefineCall(parsed) {
  const { componentName, template, script, style, stylesAttr } = parsed;

  // Build template HTML
  let templateHTML = '';
  if (style) {
    templateHTML += `<style>${style}</style>\n`;
  }
  if (template) {
    templateHTML += template;
  }

  // Extract logic object from script
  let logicCode = '{}';
  if (script) {
    // Try to extract default export
    const defaultExportMatch = script.match(/export\s+default\s+({[\s\S]*})/);
    if (defaultExportMatch) {
      logicCode = defaultExportMatch[1];
    } else {
      // If no export default, assume entire script is the logic object
      logicCode = script;
    }
  }

  // Generate the Lego.define call
  return `Lego.define('${componentName}', \`${escapeTemplate(templateHTML)}\`, ${logicCode}, '${stylesAttr}');`;
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

  if (!parsed.template && !parsed.script && !parsed.style) {
    errors.push('Component must have at least one section: <template>, <script>, or <style>');
  }

  if (!parsed.componentName) {
    errors.push('Unable to derive component name from filename');
  }

  if (parsed.componentName && !/^[a-z][a-z0-9]*(-[a-z0-9]+)+$/.test(parsed.componentName)) {
    errors.push(`Component name "${parsed.componentName}" must be kebab-case with at least one hyphen (e.g., "my-component")`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}