import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator });
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.fetch = vi.fn();
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('Component Naming Policy', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  const define = (filename) => {
    const sfc = `<template><div>Test</div></template>`;
    window.Lego.defineSFC(sfc, filename);
  };

  it('should support kebab-case (standard)', () => {
    define('user-card.lego');
    expect(document.querySelector('user-card')).toBeDefined();
  });

  it('should auto-convert PascalCase to kebab-case', () => {
    define('UserProfile.lego');
    const el = document.createElement('user-profile');
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeDefined();
  });

  it('should auto-convert camelCase to kebab-case', () => {
    define('navBar.lego');
    const el = document.createElement('nav-bar');
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeDefined();
  });

  it('should auto-convert snake_case to kebab-case', () => {
    define('data_table.lego');
    const el = document.createElement('data-table');
    document.body.appendChild(el);
    expect(el.shadowRoot).toBeDefined();
  });

  it('should throw error for single-word PascalCase (no hyphen result)', () => {
    expect(() => define('Button.lego')).toThrow(/Invalid component definition/);
  });

  it('should throw error for single-word lowercase', () => {
    expect(() => define('table.lego')).toThrow(/Invalid component definition/);
  });

  it('should throw error for single-word brand name', () => {
    expect(() => define('adidas.lego')).toThrow(/Invalid component definition/);
  });
});
