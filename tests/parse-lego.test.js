import { describe, it, expect } from 'vitest';
import {
  parseLego,
  deriveBlockName,
  generateBlockCall,
  validateLego
} from '../parse-lego.js';

describe('parse-lego tests', () => {
  it('should derive block name correctly', () => {
    expect(deriveBlockName('user-card.lego')).toBe('user-card');
    expect(deriveBlockName('src/blocks/nav-bar.lego')).toBe('nav-bar');
  });

  it('should extract attributes from template', () => {
    const sfcContent = `
<template b-stylesheets="tailwind chartist" b-id="ignored">
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
    expect(parsed.blockName).toBe('user-profile');
    expect(parsed.stylesAttr).toBe('tailwind chartist');
    expect(parsed.template).toContain('[[name]]');
    expect(parsed.script).toContain('mounted');
    expect(parsed.style).toContain('color: red');
  });

  it('should generate Lego.block call with cascade and error arguments', () => {
    const sfcContent = `<template b-stylesheets="tailwind">Hi</template>`;
    const parsed = parseLego(sfcContent, 'test-block.lego');
    const blockCall = generateBlockCall(parsed);

    expect(blockCall).toContain("Lego.block('test-block'");
    expect(blockCall).toContain(", 'tailwind', '', '');");
  });

  it('should escape correctly in template', () => {
    const complexContent = {
      blockName: 'test-block',
      template: 'I cost $5 and use `backticks`',
      script: 'export default {}',
      style: '',
      stylesAttr: 'css-set'
    };
    const escapedCall = generateBlockCall(complexContent);
    expect(escapedCall).toContain('\\$5');
    expect(escapedCall).toContain('\\`backticks\\`');
  });

  it('should validate lego block names', () => {
    const validResult = validateLego({ blockName: 'valid-name', template: '<div></div>' });
    expect(validResult.valid).toBe(true);

    const invalidResult = validateLego({ blockName: 'badname' });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some(e => e.includes('kebab-case'))).toBe(true);
  });
});
