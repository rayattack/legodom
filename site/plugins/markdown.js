/**
 * Markdown for the docs site.
 *
 * Every page under docs/ becomes a module: `{ html, title, description,
 * headings }`. The HTML is finished at build time (highlighting included), so
 * the browser's only job is to drop it into the page with b-html. Nothing in
 * it is scanned for bindings, which matters: the docs are full of `[[ ]]`.
 *
 * Also serves `virtual:site-search`, the text of every page for the search box.
 */
import MarkdownIt from 'markdown-it';
import container from 'markdown-it-container';
import { createHighlighter } from 'shiki';
import fs from 'node:fs';
import path from 'node:path';

const SEARCH_ID = 'virtual:site-search';
const LANGS = ['javascript', 'typescript', 'html', 'css', 'bash', 'json', 'diff', 'http', 'python'];
const ALIAS = { js: 'javascript', ts: 'typescript', lego: 'html', sh: 'bash', shell: 'bash' };

const escapeHTML = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Same rules VitePress used, so the #anchors already written across the docs
// (and linked from elsewhere) keep resolving: `Lego.defineLegoFile()` is
// `lego-definelegofile`.
const slugify = (text) => text
  .normalize('NFKD').replace(/[\u0300-\u036F]/g, '')
  .replace(/[\u0000-\u001f]/g, '')
  .replace(/[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g, '-')
  .replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
  .replace(/^(\d)/, '_$1')
  .toLowerCase();

/** docs/tutorial/blocks.md -> /tutorial/blocks, docs/api/index.md -> /api/ */
export const routeOf = (docsDir, file) => {
  const rel = path.relative(docsDir, file).split(path.sep).join('/').replace(/\.md$/, '');
  if (rel === 'index') return '/';
  return '/' + rel.replace(/(^|\/)index$/, '$1');
};

const frontmatter = (source) => {
  const match = source.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { data: {}, body: source };
  const data = {};
  match[1].split('\n').forEach(line => {
    const pair = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (pair) data[pair[1]] = pair[2].replace(/^['"]|['"]$/g, '');
  });
  return { data, body: source.slice(match[0].length) };
};

export const listPages = (docsDir) => {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // docs/docs is a stale build output, docs/public is static files.
        if (dir === docsDir && (entry.name === 'docs' || entry.name === 'public')) continue;
        walk(full);
      } else if (entry.name.endsWith('.md')) out.push(full);
    }
  };
  walk(docsDir);
  return out.sort();
};

export const createRenderer = async ({ docsDir, base }) => {
  const highlighter = await createHighlighter({ themes: ['github-dark'], langs: LANGS });
  const prefix = base.replace(/\/$/, '');

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code, info) {
      const [rawLang = '', ...rest] = info.trim().split(/\s+/);
      const label = (rest.join(' ').match(/\[(.+)\]/) || [])[1] || '';
      const lang = ALIAS[rawLang] || rawLang;
      const known = LANGS.includes(lang);
      const body = known
        ? highlighter.codeToHtml(code.replace(/\n$/, ''), { lang, theme: 'github-dark' })
        : `<pre class="shiki"><code>${escapeHTML(code.replace(/\n$/, ''))}</code></pre>`;
      const title = label ? `<span class="code-title">${escapeHTML(label)}</span>` : '';
      return `<div class="code" data-lang="${escapeHTML(rawLang || 'text')}">${title}<span class="code-lang">${escapeHTML(rawLang)}</span><button type="button" class="code-copy" aria-label="Copy code">Copy</button>${body}</div>`;
    }
  });
  // highlight() returns the finished block; stop markdown-it wrapping it again.
  md.renderer.rules.fence = (tokens, idx, options) => options.highlight(tokens[idx].content, tokens[idx].info);

  const LABELS = { tip: 'Tip', warning: 'Warning', danger: 'Danger', info: 'Note' };
  for (const kind of Object.keys(LABELS)) {
    md.use(container, kind, {
      render(tokens, idx) {
        if (tokens[idx].nesting !== 1) return '</div>\n';
        const title = tokens[idx].info.trim().slice(kind.length).trim() || LABELS[kind];
        return `<div class="note note-${kind}"><p class="note-title">${md.utils.escapeHtml(title)}</p>\n`;
      }
    });
  }
  md.use(container, 'details', {
    render(tokens, idx) {
      if (tokens[idx].nesting !== 1) return '</details>\n';
      const title = tokens[idx].info.trim().slice('details'.length).trim() || 'Details';
      return `<details class="note note-info"><summary>${md.utils.escapeHtml(title)}</summary>\n`;
    }
  });
  md.use(container, 'code-group', {
    render: (tokens, idx) => (tokens[idx].nesting === 1 ? '<div class="code-group">\n' : '</div>\n')
  });

  md.renderer.rules.table_open = () => '<div class="table-wrap"><table>\n';
  md.renderer.rules.table_close = () => '</table></div>\n';

  /** Render one file. `env` carries the page's own route for relative links. */
  const render = (file, source) => {
    const { data, body } = frontmatter(source);
    const route = routeOf(docsDir, file);
    const dir = route.endsWith('/') ? route : route.replace(/[^/]*$/, '');
    const headings = [];
    const used = new Set();
    let title = data.title || '';

    md.renderer.rules.heading_open = (tokens, idx) => {
      const token = tokens[idx];
      const level = Number(token.tag.slice(1));
      const text = tokens[idx + 1].children
        .filter(t => t.type === 'text' || t.type === 'code_inline')
        .map(t => t.content).join('');
      if (level === 1) {
        if (!title) title = text;
        return '<h1>';
      }
      let id = slugify(text) || 'section';
      for (let n = 1; used.has(id); n++) id = `${slugify(text)}-${n}`;
      used.add(id);
      if (level <= 3) headings.push({ id, text, level });
      return `<${token.tag} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>`;
    };

    md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      let href = token.attrGet('href') || '';
      if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) {
        token.attrSet('target', '_blank');
        token.attrSet('rel', 'noreferrer');
      } else if (!href.startsWith('#')) {
        const [pathPart, hash = ''] = href.split('#');
        let target = pathPart.startsWith('/') ? pathPart : path.posix.join(dir, pathPart);
        target = target.replace(/\.(md|html)$/, '').replace(/(^|\/)index$/, '$1');
        token.attrSet('href', prefix + target + (hash ? `#${hash}` : ''));
        token.attrSet('b-link', '');
      }
      return self.renderToken(tokens, idx, options);
    };

    const html = md.render(body);
    const text = body
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^:::.*$/gm, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[#*_`>|[\]()]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    const description = data.description || text.slice(0, 160);
    return { route, html, title: title || 'LegoDOM', description, headings, text, layout: data.layout || '' };
  };

  return { render };
};

export default function markdownPlugin({ docsDir, base }) {
  let renderer;
  const ready = () => (renderer ||= createRenderer({ docsDir, base }));

  return {
    name: 'legodom-site-markdown',
    enforce: 'pre',

    resolveId(id) {
      if (id === SEARCH_ID) return '\0' + SEARCH_ID;
    },

    async load(id) {
      if (id !== '\0' + SEARCH_ID) return;
      const { render } = await ready();
      const entries = listPages(docsDir).map(file => {
        this.addWatchFile(file);
        const page = render(file, fs.readFileSync(file, 'utf8'));
        return {
          path: page.route,
          title: page.title,
          headings: page.headings.map(h => ({ id: h.id, text: h.text })),
          text: page.text.slice(0, 4000)
        };
      });
      return `export default ${JSON.stringify(entries)};`;
    },

    async transform(source, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.md')) return;
      const { render } = await ready();
      const { text, ...page } = render(file, source);
      return { code: `export default ${JSON.stringify(page)};`, map: null };
    }
  };
}
