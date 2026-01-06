import { describe, it, expect } from 'vitest';
import { parseLego, generateDefineCall, validateLego, deriveComponentName } from './parse-lego.js';

describe('LegoJS SFC Parser', () => {
  describe('deriveComponentName', () => {
    it('should derive component name from filename', () => {
      expect(deriveComponentName('sample-component.lego')).toBe('sample-component');
      expect(deriveComponentName('path/to/my-button.lego')).toBe('my-button');
    });
  });

  describe('parseLego', () => {
    it('should parse all three sections', () => {
      const content = `
<template>
  <h1>{{ title }}</h1>
</template>

<script>
export default {
  title: 'Hello'
}
</script>

<style>
  self { color: red; }
</style>
      `;

      const result = parseLego(content, 'test-component.lego');
      expect(result.componentName).toBe('test-component');
      expect(result.template).toContain('<h1>{{ title }}</h1>');
      expect(result.script).toContain('export default');
      expect(result.style).toContain('self { color: red; }');
    });

    it('should handle components with only template', () => {
      const content = '<template><p>Hello</p></template>';
      const result = parseLego(content, 'simple.lego');
      expect(result.template).toBe('<p>Hello</p>');
      expect(result.script).toBe('');
      expect(result.style).toBe('');
    });

    it('should handle components with only script', () => {
      const content = '<script>export default { count: 0 }</script>';
      const result = parseLego(content, 'logic.lego');
      expect(result.script).toContain('count: 0');
      expect(result.template).toBe('');
    });
  });

  describe('validateLego', () => {
    it('should validate correct component name', () => {
      const parsed = {
        componentName: 'my-component',
        template: '<div>Test</div>',
        script: '',
        style: ''
      };
      const result = validateLego(parsed);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid component names', () => {
      const parsed = {
        componentName: 'MyComponent',  // Not kebab-case
        template: '<div>Test</div>',
        script: '',
        style: ''
      };
      const result = validateLego(parsed);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should require at least one section', () => {
      const parsed = {
        componentName: 'empty-component',
        template: '',
        script: '',
        style: ''
      };
      const result = validateLego(parsed);
      expect(result.valid).toBe(false);
    });
  });

  describe('generateDefineCall', () => {
    it('should generate valid Lego.define call', () => {
      const parsed = {
        componentName: 'test-comp',
        template: '<button>Click</button>',
        script: 'export default { count: 0 }',
        style: 'self { color: blue; }'
      };

      const result = generateDefineCall(parsed);
      expect(result).toContain('Lego.define');
      expect(result).toContain('test-comp');
      expect(result).toContain('<button>Click</button>');
      expect(result).toContain('{ count: 0 }');
      expect(result).toContain('self { color: blue; }');
    });
  });
});
