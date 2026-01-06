/**
 * Parser for .lego Single File Components
 * Extracts template, script, and style sections from .lego files
 */

/**
 * Parse a .lego file content into structured sections
 * @param {string} content - Raw .lego file content
 * @param {string} filename - Filename for error reporting
 * @returns {{template: string, script: string, style: string, componentName: string}}
 */
export function parseLego(content, filename = 'component.lego') {
  const result = {
    template: '',
    script: '',
    style: '',
    componentName: deriveComponentName(filename)
  };

  // Extract template section
  const templateMatch = content.match(/<template>([\s\S]*?)<\/template>/);
  if (templateMatch) {
    result.template = templateMatch[1].trim();
  }

  // Extract script section
  const scriptMatch = content.match(/<script>([\s\S]*?)<\/script>/);
  if (scriptMatch) {
    result.script = scriptMatch[1].trim();
  }

  // Extract style section
  const styleMatch = content.match(/<style>([\s\S]*?)<\/style>/);
  if (styleMatch) {
    result.style = styleMatch[1].trim();
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
  const { componentName, template, script, style } = parsed;

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
  return `Lego.define('${componentName}', \`${escapeTemplate(templateHTML)}\`, ${logicCode});`;
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
