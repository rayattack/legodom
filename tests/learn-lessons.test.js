import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { lessons } from '../docs/learn/course.js';

// Every lesson of the interactive tutorial is run here exactly as the docs
// site runs it: the same sandbox runtime, the same built library. A lesson
// whose starting files or solution stop working fails the suite.

const root = path.resolve(__dirname, '..');
const libCode = fs.readFileSync(path.join(root, 'dist/lego.min.js'), 'utf8');
const runtimeCode = fs.readFileSync(path.join(root, 'site/src/lib/sandbox-runtime.js'), 'utf8');

const readDir = (dir) => {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs.readdirSync(dir).map(name => [name, fs.readFileSync(path.join(dir, name), 'utf8')])
  );
};

const lessonFiles = (lesson) => {
  const dir = path.join(root, 'docs', lesson.path);
  const a = readDir(path.join(dir, 'a'));
  const b = readDir(path.join(dir, 'b'));
  return { a, b, solved: { ...a, ...b } };
};

const run = async (files) => {
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { url: 'http://localhost/', runScripts: 'dangerously' });
  const win = dom.window;
  const messages = [];
  win.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  win.cancelAnimationFrame = (id) => clearTimeout(id);
  win.__LEGO_HOST__ = { postMessage: (msg) => messages.push(msg) };
  win.__LEGO_PROJECT__ = { files, storage: {}, token: 't' };
  win.eval(runtimeCode);
  win.eval(libCode);
  win.__legoSandbox.boot();
  await new Promise(resolve => setTimeout(resolve, 60));
  win.__legoSandbox.publishState();
  const result = {
    win,
    errors: messages.filter(m => m.type === 'error' || (m.type === 'console' && (m.level === 'error' || m.level === 'warn'))),
    blocks: (messages.filter(m => m.type === 'state').pop() || { blocks: [] }).blocks,
    ready: messages.some(m => m.type === 'ready')
  };
  return result;
};

// Every instance of a block the project defines, however deep, and whether it
// mounted. A nested block that never mounts renders as nothing at all, which
// no error message would ever report.
const unmounted = (root, tags, out = []) => {
  root.querySelectorAll('*').forEach(el => {
    const tag = el.tagName.toLowerCase();
    if (tags.includes(tag) && !(el.state && typeof el.state === 'object')) out.push(tag);
    if (el.shadowRoot) unmounted(el.shadowRoot, tags, out);
  });
  return out;
};
const blockTags = (files) => Object.keys(files).filter(n => n.endsWith('.lego')).map(n => n.replace(/\.lego$/, ''));

// Text of the page including every shadow root, which is what a learner sees.
const deepText = (node) => {
  let out = '';
  node.childNodes.forEach(child => {
    if (child.nodeType === 3) out += child.textContent;
    else if (child.nodeType === 1 && !['STYLE', 'SCRIPT', 'TEMPLATE'].includes(child.tagName)) {
      out += deepText(child.shadowRoot || child) + ' ';
    }
  });
  return out.replace(/\s+/g, ' ');
};

describe('interactive tutorial lessons', () => {
  it('has a page and a starting project for every lesson in the course', () => {
    for (const lesson of lessons) {
      expect(fs.existsSync(path.join(root, 'docs', `${lesson.path}.md`)), `${lesson.path}.md`).toBe(true);
      expect(Object.keys(lessonFiles(lesson).a).length, `${lesson.path}/a`).toBeGreaterThan(0);
    }
  });

  for (const lesson of lessons) {
    describe(lesson.path, () => {
      const { a, b, solved } = lessonFiles(lesson);

      it('starting files run without errors', async () => {
        const result = await run(a);
        expect(result.errors).toEqual([]);
        expect(result.ready).toBe(true);
        result.win.close();
      });

      it('solution runs without errors and mounts a block', async () => {
        const result = await run(solved);
        expect(result.errors).toEqual([]);
        expect(result.blocks.length).toBeGreaterThan(0);
        expect(unmounted(result.win.document, blockTags(solved))).toEqual([]);
        expect(deepText(result.win.document.body)).not.toMatch(/\[\[|\]\]|undefined|NaN/);
        result.win.close();
      });

      it('solution only overrides files the lesson starts with', () => {
        for (const name of Object.keys(b)) expect(Object.keys(a)).toContain(name);
      });
    });
  }

  it('keeps $db values between runs through the storage message', async () => {
    const lesson = lessons.find(l => l.slug === 'persistence');
    const result = await run(lessonFiles(lesson).solved);
    const host = result.win.document.querySelector('saved-counter');
    host.shadowRoot.querySelector('button').click();
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(result.win.localStorage.getItem('learn.count')).toBe('1');
    result.win.close();
  });
});
