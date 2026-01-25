import { deriveBlockName } from './helpers.js';
export { deriveBlockName };

/**
 * Parser for .lego Single File Blocks (SFB)
 * Extracts template, script, and style sections from .lego files
 */

/**
 * Parse a .lego file content into structured sections
 * @param {string} content - Raw .lego file content
 * @param {string} filename - Filename for error reporting
 * @returns {{template: string, script: string, style: string, stylesAttr: string, cascadeAttr: string, errorAttr: string, blockName: string}}
 */
export function parseLego(content, filename = 'block.lego') {
  const result = {
    template: '',
    script: '',
    style: '',
    stylesAttr: '',
    cascadeAttr: '',
    errorAttr: '',
    blockName: deriveBlockName(filename)
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
      // Extract b-cascade attribute if present
      const bCascadeMatch = attrs.match(/b-cascade=["']([^"']+)["']/);
      if (bCascadeMatch) {
        result.cascadeAttr = bCascadeMatch[1];
      }
      // Extract b-error attribute if present
      const bErrorMatch = attrs.match(/b-error=["']([^"']+)["']/);
      if (bErrorMatch) {
        result.errorAttr = bErrorMatch[1];
      }
    } else if (tagName === 'script') {
      result.script = innerContent.trim();
      const langMatch = attrs.match(/lang=["']([^"']+)["']/);
      if (langMatch) {
        result.scriptLang = langMatch[1];
      }
    } else if (tagName === 'style') {
      result.style = innerContent.trim();
    }

    // Advance past this block (content + closing tag)
    remaining = remaining.slice(contentEnd + closeTag.length);
  }

  return result;
}



/**
 * Generate Lego.block() code from parsed .lego file
 * @param {object} parsed - Parsed .lego file object
 * @returns {string} - JavaScript code string
 */
export function generateBlockCall(parsed) {
  const { blockName, template, script, style, stylesAttr, cascadeAttr, errorAttr } = parsed;

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

  // Generate the Lego.block call
  return `Lego.block('${blockName}', \`${escapeTemplate(templateHTML)}\`, ${logicCode}, '${stylesAttr}', '${cascadeAttr}', '${errorAttr}');`;
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