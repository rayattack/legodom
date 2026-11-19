// Every markdown page as a lazily loaded module. The markdown plugin turns
// each file into `{ html, title, description, headings }` at build time.
const modules = import.meta.glob(['../../../docs/**/*.md', '!../../../docs/docs/**'], { import: 'default' });

const byRoute = {};
for (const key of Object.keys(modules)) {
  const rel = key.replace(/^.*\/docs\//, '').replace(/\.md$/, '');
  const route = '/' + rel.replace(/(^|\/)index$/, '$1');
  byRoute[route] = modules[key];
}

/** @returns {Promise<{html: string, title: string, description: string, headings: Array}|null>} */
export const loadPage = async (path) => {
  const loader = byRoute[path] || byRoute[path.replace(/\/$/, '')] || byRoute[path + '/'];
  return loader ? loader() : null;
};
