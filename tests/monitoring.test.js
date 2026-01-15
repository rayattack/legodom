import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { Monitoring } from '../monitoring-plugin.js';

// Setup Mock DOM with Performance API
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: "dangerously",
  resources: "usable"
});

global.window = dom.window;
global.document = dom.window.document;
global.performance = {
  mark: vi.fn(),
  measure: vi.fn(),
  getEntriesByName: vi.fn(() => [{ duration: 20 }]), // Mock 20ms render
  clearMarks: vi.fn(),
  clearMeasures: vi.fn()
};
global.HTMLElement = dom.window.HTMLElement;
global.customElements = dom.window.customElements;
global.MutationObserver = dom.window.MutationObserver;
global.Node = dom.window.Node;
global.NodeFilter = dom.window.NodeFilter;
global.Element = dom.window.Element;
global.Event = dom.window.Event;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);

const libCode = fs.readFileSync(path.resolve(__dirname, '../main.js'), 'utf8');
eval(libCode);

describe('LegoDOM Monitoring Plugin', () => {
  beforeEach(async () => {
    document.body.innerHTML = '';
    await window.Lego.init(document.body);
    Monitoring.install(window.Lego, { reportToConsole: false });
    window.Lego.metrics.reset();
  });

  it('should track render count and duration', async () => {
    window.Lego.define('monitor-test', '<div>[[ msg ]]</div>');
    const el = document.createElement('monitor-test');
    el.setAttribute('b-data', "{ msg: 'hello' }");
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const metrics = window.Lego.metrics.get();
    expect(metrics.renders).toBeGreaterThan(0);

    const stats = metrics.components.get('monitor-test');
    expect(stats).toBeDefined();
    expect(stats.count).toBe(1);
    // Since we mocked getEntriesByName to return 20ms
    expect(stats.avg).toBe(20);
    expect(metrics.slowRenders).toBe(1); // 20ms > 16ms threshold
  });

  it('should track errors via the hooked onError handler', async () => {
    window.Lego.define('monitor-error', '<div>[[ throwErr() ]]</div>', {
      throwErr() { throw new Error('Monitor Fail'); }
    });

    const el = document.createElement('monitor-error');
    document.body.appendChild(el);

    await new Promise(r => setTimeout(r, 100));

    const metrics = window.Lego.metrics.get();
    expect(metrics.errors).toBe(1);
  });
});
