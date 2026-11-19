/**
 * Every internal link in the docs must land on a page that exists, and every
 * #anchor on a heading that exists. Run with `npm run docs:check`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, listPages } from '../plugins/markdown.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const docsDir = path.resolve(here, '../../docs');
const BASE = '/legodom';

const { render } = await createRenderer({ docsDir, base: BASE + '/' });
const pages = new Map();
for (const file of listPages(docsDir)) {
  const page = render(file, fs.readFileSync(file, 'utf8'));
  const ids = new Set([...page.html.matchAll(/<h[2-6] id="([^"]+)"/g)].map(m => m[1]));
  pages.set(page.route, { file: path.relative(docsDir, file), html: page.html, ids });
}
// Routes the app serves that are not markdown.
for (const route of ['/', '/learn/', '/play/']) if (!pages.has(route)) pages.set(route, { ids: new Set(), html: '' });

const find = (route) => pages.get(route) || pages.get(route + '/') || pages.get(route.replace(/\/$/, ''));
const problems = [];
for (const [route, page] of pages) {
  for (const [, href] of page.html.matchAll(/<a href="([^"]+)" b-link/g)) {
    const [target, hash] = href.slice(BASE.length).split('#');
    const dest = find(target || '/');
    if (!dest) problems.push(`${page.file}: no page at ${target}`);
    else if (hash && !dest.ids.has(decodeURIComponent(hash))) problems.push(`${page.file}: no #${hash} on ${target}`);
  }
  for (const [, hash] of page.html.matchAll(/<a href="#([^"]+)"(?! class="anchor")/g)) {
    if (!page.ids.has(decodeURIComponent(hash))) problems.push(`${page.file}: no #${hash} on this page`);
  }
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} broken link(s)`);
  process.exit(1);
}
console.log(`links ok across ${pages.size} pages`);
