import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const libCode = fs.readFileSync(path.resolve(__dirname, '../dist/lego.min.js'), 'utf8');

const setup = () => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
  const win = dom.window;
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  win.eval(libCode);
  return win;
};
const tick = (ms = 30) => new Promise(resolve => setTimeout(resolve, ms));

// Lego.defineLegoFile() called directly (no loader, no bundler) used to mount
// only the instances already on the page. Anything that appeared later, or
// that lived inside another block's shadow root, stayed an inert unknown tag.
describe('Lego.defineLegoFile registers the custom element', () => {
  it('mounts an instance added after the definition', async () => {
    const win = setup();
    win.Lego.defineLegoFile('<template><p>hi [[ name ]]</p></template><script>export default { name: "Ada" }</script>', 'late-block.lego');
    await win.Lego.init();
    expect(win.customElements.get('late-block')).toBeTruthy();

    win.document.body.appendChild(win.document.createElement('late-block'));
    await tick();
    expect(win.document.querySelector('late-block').shadowRoot.textContent).toContain('hi Ada');
  });

  it('mounts a block nested in another block defined the same way', async () => {
    const win = setup();
    win.Lego.defineLegoFile('<template><inner-part></inner-part></template>', 'outer-part.lego');
    win.Lego.defineLegoFile('<template><b>inner</b></template>', 'inner-part.lego');
    win.document.body.innerHTML = '<outer-part></outer-part>';
    await win.Lego.init();
    await tick();
    const inner = win.document.querySelector('outer-part').shadowRoot.querySelector('inner-part');
    expect(inner.shadowRoot.textContent).toBe('inner');
  });

  it('still upgrades instances that were on the page first', async () => {
    const win = setup();
    win.document.body.innerHTML = '<early-block></early-block>';
    win.Lego.defineLegoFile('<template><i>early</i></template>', 'early-block.lego');
    await tick();
    expect(win.document.querySelector('early-block').shadowRoot.textContent).toBe('early');
  });
});
