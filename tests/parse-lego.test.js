import { describe, it, expect } from 'vitest';
import {
  parseLego,
  deriveComponentName,
  generateDefineCall,
  validateLego
} from '../parse-lego.js';

describe('parse-lego tests', () => {
  it('should derive component name correctly', () => {
    expect(deriveComponentName('user-card.lego')).toBe('user-card');
    expect(deriveComponentName('src/components/nav-bar.lego')).toBe('nav-bar');
  });

  it('should extract attributes from template', () => {
    const sfcContent = `
<template b-styles="tailwind chartist" b-id="ignored">
  <div class="p-4">Hello [[name]]</div>
</template>
<script>
export default { mounted() { console.log('hi') } }
</script>
<style>
  div { color: red; }
</style>
`;
    const parsed = parseLego(sfcContent, 'user-profile.lego');
    expect(parsed.componentName).toBe('user-profile');
    expect(parsed.stylesAttr).toBe('tailwind chartist');
    expect(parsed.template).toContain('[[name]]');
    expect(parsed.script).toContain('mounted');
    expect(parsed.style).toContain('color: red');
  });

  it('should generate Lego.define call with 4th argument', () => {
    const sfcContent = `<template b-styles="tailwind">Hi</template>`;
    const parsed = parseLego(sfcContent, 'test.lego');
    const defineCall = generateDefineCall(parsed);

    expect(defineCall).toContain("Lego.define('test'");
    expect(defineCall).toContain(", 'tailwind');");
  });

  it('should escape correctly in template', () => {
    const complexContent = {
      componentName: 'test-comp',
      template: 'I cost $5 and use `backticks`',
      script: 'export default {}',
      style: '',
      stylesAttr: 'css-set'
    };
    const escapedCall = generateDefineCall(complexContent);
    expect(escapedCall).toContain('\\$5');
    expect(escapedCall).toContain('\\`backticks\\`');
  });

  it('should validate lego component names', () => {
    const validResult = validateLego({ componentName: 'valid-name', template: '<div></div>' });
    expect(validResult.valid).toBe(true);

    const invalidResult = validateLego({ componentName: 'badname' });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some(e => e.includes('kebab-case'))).toBe(true);
  });
});
