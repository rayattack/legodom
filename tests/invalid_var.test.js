import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { flush } from './test-utils.js';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, writable: true, configurable: true });
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.CustomEvent = dom.window.CustomEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

// Use dist/lego.min.js as per previous fix context (but we are testing source changes for now? 
// No, unit tests usually test source or build depending on setup. 
// The previous test suite used dist/lego.min.js because I wasn't sure if source was working / I needed to test build.
// But now I am modifying source. I should probably test SOURCE if I can, but vitest setup seems to load dist in my previous artifacts.
// I'll stick to loading dist/lego.min.js for consistency but I MUST REBUILD before testing.
// Wait, I can't rebuild before testing if I haven't applied changes.
// I should try to test the SOURCE logic if possible, but the environment setup in previous tests was eval(libCode).
// I will assume I need to rebuild to test. 
// OR I can try to test purely by mocking if I can't load source.
// Let's use dist/lego.min.js and I will rebuild in step 3. 

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');
eval(libCode);

describe('Invalid Variable Rendering', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
  });

  it('should render empty string for invalid variables instead of raw template', async () => {
    // 1. Define block with invalid variable
    window.Lego.block('invalid-var-test', '<div>[[ nonExistent ]]</div>', {});

    // 2. Render
    const el = document.createElement('invalid-var-test');
    document.body.appendChild(el);

    await flush();

    // 3. Check content
    const target = el.shadowRoot || el;
    // Current behavior (Fail): Content is "[[ nonExistent ]]"
    // Desired behavior (Pass): Content is "" (empty div)

    // For now, let's just log what we get
    console.log('Content:', target.innerHTML);

    // Assertion for DESIRED behavior
    expect(target.textContent).toBe('');
  });
});
