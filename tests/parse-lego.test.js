import { describe, it, expect } from 'vitest';
import {
  parseLego,
  deriveBlockName,
  generateBlockCall,
  validateLego
} from '../src/utils/parser-utils.js';

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

  it('should generate an options-object Lego.block call carrying every attribute', () => {
    const sfcContent = `<template b-stylesheets="tailwind">Hi</template>`;
    const parsed = parseLego(sfcContent, 'test-block.lego');
    const blockCall = generateBlockCall(parsed);

    expect(blockCall).toContain("Lego.block('test-block', {");
    expect(blockCall).toContain('styles: "tailwind"');
    expect(blockCall).toContain('cascade: ""');
    expect(blockCall).toContain('error: ""');
    expect(blockCall).toContain('props: ""');
    expect(blockCall).toContain('shadow: true');
    expect(blockCall).toContain('form: false');
  });

  it('should carry b-shadow and b-form through to the generated call', () => {
    const sfcContent = `<template b-shadow="false" b-form>Hi</template>`;
    const parsed = parseLego(sfcContent, 'light-form.lego');

    expect(parsed.shadowAttr).toBe('false');
    expect(parsed.formAttr).toBe(true);

    const blockCall = generateBlockCall(parsed);
    expect(blockCall).toContain('shadow: false');
    expect(blockCall).toContain('form: true');
  });

  it('audit fix #52: interpolated attrs are JSON-encoded, not manually quoted (build-time injection)', () => {
    const malicious = {
      blockName: 'evil-block',
      template: 'Hi',
      script: 'export default {}',
      style: '',
      stylesAttr: "x'+require('child_process').execSync('id')+'",
      cascadeAttr: "y\"; alert(1); //",
      errorAttr: '',
      propsAttr: ''
    };
    const blockCall = generateBlockCall(malicious);

    // The attacker-controlled attrs must be safely encoded as string literals,
    // never splice raw JS that breaks out of the surrounding quotes.
    expect(blockCall).toContain(JSON.stringify(malicious.stylesAttr));
    expect(blockCall).toContain(JSON.stringify(malicious.cascadeAttr));

    // Prove it stays inert data: evaluate the call against a stub Lego.block
    // and confirm the malicious payload arrives verbatim as a plain string
    // argument, rather than being executed/spliced as code.
    let capturedArgs;
    const Lego = { block: (...args) => { capturedArgs = args; } };
    new Function('Lego', blockCall)(Lego);
    expect(capturedArgs[1].styles).toBe(malicious.stylesAttr);
    expect(capturedArgs[1].cascade).toBe(malicious.cascadeAttr);
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
    const validResult = validateLego({ blockName: 'valid-name', hasTemplate: true, template: '<div></div>' });
    expect(validResult.valid).toBe(true);

    const invalidResult = validateLego({ blockName: 'badname' });
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors.some(e => e.includes('kebab-case'))).toBe(true);
  });
});
