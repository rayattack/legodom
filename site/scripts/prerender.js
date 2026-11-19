/**
 * After `vite build`: give every route a real HTML file.
 *
 * The site is a single-page app, and a static host answers a deep link only
 * if a file sits at that path. So each page gets a copy of the app shell with
 * its own title and description, and with its content already in the page,
 * which is what a crawler, a link preview or a reader without JavaScript
 * sees. When the app starts, the router replaces that content with the live
 * block.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, listPages } from '../plugins/markdown.js';
import { course, lessons } from '../../docs/learn/course.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const docsDir = path.join(repo, 'docs');
const dist = path.join(here, '../dist');
const BASE = '/legodom';

const escapeHTML = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const shell = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
if (!shell.includes('<!--prerender-->')) throw new Error('index.html lost its <!--prerender--> marker');

const page = ({ title, description, body }) => shell
  .replace(/<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`)
  .replace(/(<meta name="description" content=")[^"]*(")/, `$1${escapeHTML(description)}$2`)
  .replace('<!--prerender-->', body);

/** '/tutorial/blocks' -> tutorial/blocks.html, '/api/' -> api/index.html */
const write = (route, html) => {
  const file = route.endsWith('/') ? path.join(dist, route, 'index.html') : path.join(dist, `${route}.html`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
};

const { render } = await createRenderer({ docsDir, base: BASE + '/' });
let count = 0;

for (const file of listPages(docsDir)) {
  const doc = render(file, fs.readFileSync(file, 'utf8'));
  const isLesson = doc.route.startsWith('/learn/');
  write(doc.route, page({
    title: `${doc.title} | ${isLesson ? 'Learn LegoDOM' : 'LegoDOM'}`,
    description: doc.description,
    body: `<div class="doc-layout"><main class="doc-main"><article class="prose">${doc.html}</article></main></div>`
  }));
  count++;
}

const courseList = course.map(chapter =>
  `<h2>${escapeHTML(chapter.title)}</h2><ol>${chapter.lessons.map(lesson =>
    `<li><a href="${BASE}/learn/${chapter.slug}/${lesson.slug}">${escapeHTML(lesson.title)}</a></li>`).join('')}</ol>`
).join('');

write('/learn/', page({
  title: 'Learn | LegoDOM',
  description: `An interactive tutorial: ${lessons.length} short lessons that run in the page.`,
  body: `<div class="doc-layout"><main class="doc-main"><article class="prose"><h1>Learn LegoDOM by building</h1>${courseList}</article></main></div>`
}));
write('/play/', page({
  title: 'Playground | LegoDOM',
  description: 'Write LegoDOM blocks in the browser and share them with a link.',
  body: ''
}));
count += 2;

// The home page keeps the shell as built, with a short static introduction.
fs.writeFileSync(path.join(dist, 'index.html'), page({
  title: 'LegoDOM: build blocks, use them as HTML',
  description: 'Reactive web components with no imports, no virtual DOM and no required build step.',
  body: `<div class="doc-layout"><main class="doc-main"><article class="prose"><h1>Build blocks. Use them as HTML.</h1><p>LegoDOM turns a template into a reactive, encapsulated custom element.</p><p><a href="${BASE}/learn/">Start the tutorial</a></p></article></main></div>`
}));

// Anything else: the app boots and shows its own "page not found".
fs.writeFileSync(path.join(dist, '404.html'), page({ title: 'Page not found | LegoDOM', description: '', body: '' }));

console.log(`prerendered ${count + 1} pages into ${path.relative(repo, dist)}`);
