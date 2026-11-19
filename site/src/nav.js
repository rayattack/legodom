// The site's map: base path, top navigation and the sidebar of each section.

export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');   // '/legodom'
export const REPO = 'https://github.com/rayattack/LegoDOM';
export const VERSION = __LEGO_VERSION__;

/** Site path ('/tutorial/blocks') to a URL the browser can load. */
export const href = (path) => BASE + path;
/** The current location as a site path, without the base or a trailing .html. */
export const sitePath = (pathname = window.location.pathname) => {
  const path = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname;
  return (path || '/').replace(/\.html$/, '');
};

export const topNav = [
  { text: 'Learn', path: '/learn/', match: '/learn' },
  { text: 'Playground', path: '/play/', match: '/play' },
  { text: 'Quickstart', path: '/quickstart/', match: '/quickstart' },
  { text: 'Guide', path: '/tutorial/', match: '/tutorial' },
  { text: 'API', path: '/api/', match: '/api' },
  { text: 'Router', path: '/router/', match: '/router' },
  { text: 'Examples', path: '/examples/', match: '/examples' },
  { text: 'Internals', path: '/contributing/', match: '/contributing' }
];

const group = (text, items) => ({ text, items: items.map(([label, path]) => ({ text: label, path })) });

export const sidebars = {
  quickstart: [
    group('Build a task tracker', [
      ['Overview', '/quickstart/'],
      ['1. Project setup', '/quickstart/01-project-setup'],
      ['2. Your first block', '/quickstart/02-your-first-block'],
      ['3. Routing and layouts', '/quickstart/03-adding-routes'],
      ['4. Persistence and forms', '/quickstart/04-multi-page-app'],
      ['5. State, guards and beyond', '/quickstart/05-state-and-globals'],
      ['6. Dynamic mounting', '/quickstart/06-dynamic-mounting']
    ])
  ],
  tutorial: [
    group('Introduction', [
      ['What is LegoDOM?', '/tutorial/'],
      ['Getting started', '/tutorial/getting-started'],
      ['Quick start', '/tutorial/quick-start'],
      ['FAQ', '/tutorial/faq']
    ]),
    group('Core concepts', [
      ['The Lego object', '/tutorial/the-lego-object'],
      ['Blocks', '/tutorial/blocks'],
      ['Templating', '/tutorial/templating'],
      ['Props', '/tutorial/props'],
      ['Slots', '/tutorial/slots'],
      ['Layouts and composition', '/tutorial/layouts'],
      ['Reactivity', '/tutorial/reactivity'],
      ['Directives', '/tutorial/directives'],
      ['Events', '/tutorial/events'],
      ['Routing', '/tutorial/routing'],
      ['Error handling', '/tutorial/error-handling'],
      ['Persistence ($db)', '/tutorial/persistence'],
      ['Helpers', '/tutorial/helpers']
    ]),
    group('Advanced', [
      ['Lego files (.lego)', '/tutorial/lego-files'],
      ['Authentication', '/tutorial/authentication'],
      ['Lego Studio', '/tutorial/studio'],
      ['CDN usage', '/tutorial/cdn-usage'],
      ['Lifecycle hooks', '/tutorial/lifecycle'],
      ['Large apps', '/tutorial/directory-structure'],
      ['Server side blocks', '/tutorial/server-side'],
      ['Server-side rendering', '/tutorial/ssr'],
      ['TypeScript', '/tutorial/typescript'],
      ['Testing', '/tutorial/testing']
    ])
  ],
  api: [
    group('API reference', [
      ['Overview', '/api/'],
      ['Lego.createApp()', '/api/create-app'],
      ['Lego.init()', '/api/init'],
      ['Lego.block()', '/api/block'],
      ['Lego.route()', '/api/route'],
      ['Lego.globals', '/api/globals'],
      ['Lego.config', '/api/config'],
      ['Directives', '/api/directives'],
      ['Lifecycle hooks', '/api/lifecycle'],
      ['Advanced API', '/api/advanced'],
      ['Vite plugin', '/api/vite-plugin']
    ])
  ],
  router: [
    group('Router', [
      ['About', '/router/'],
      ['Basic routing', '/router/basic-routing'],
      ['Surgical swaps', '/router/surgical-swaps'],
      ['Cold entry', '/router/cold-entry'],
      ['History', '/router/history'],
      ['Target resolver', '/router/resolver']
    ])
  ],
  examples: [
    group('Examples', [
      ['Overview', '/examples/'],
      ['Todo app', '/examples/todo-app'],
      ['Routing demo', '/examples/routing'],
      ['Lego files showcase', '/examples/lego-files-showcase'],
      ['Form validation', '/examples/form']
    ])
  ],
  contributing: [
    group('How LegoDOM works', [
      ['Start here', '/contributing/'],
      ['1. Welcome', '/contributing/01-welcome'],
      ['2. The registry', '/contributing/02-registry'],
      ['3. Batching', '/contributing/03-batcher'],
      ['4. Reactivity', '/contributing/04-reactivity'],
      ['5. Caching', '/contributing/05-caching'],
      ['6. Init', '/contributing/06-init'],
      ['7. Observer', '/contributing/07-observer'],
      ['8. Snap', '/contributing/08-snap'],
      ['9. Diffing', '/contributing/09-diffing'],
      ['10. Studs (reactive state)', '/contributing/10-studs'],
      ['11. Scanner', '/contributing/11-scanner'],
      ['12. Render', '/contributing/12-render'],
      ['13. Directives', '/contributing/13-directives'],
      ['14. Events', '/contributing/14-events'],
      ['15. Router', '/contributing/15-router'],
      ['16. Global state and $db', '/contributing/16-state'],
      ['17. LegoDOM', '/contributing/17-legodom'],
      ['18. Directive lifecycle', '/contributing/18-directive-lifecycle']
    ])
  ]
};

/** 'tutorial' for '/tutorial/blocks'; '' when the path is not a docs section. */
export const sectionOf = (path) => {
  const name = path.split('/')[1] || '';
  return name in sidebars ? name : '';
};

/** The pages before and after `path` in its section's sidebar. */
export const neighbours = (path) => {
  const section = sectionOf(path);
  if (!section) return { previous: null, next: null };
  const flat = sidebars[section].flatMap(g => g.items);
  const clean = path.length > 1 && !flat.some(i => i.path === path) ? path.replace(/\/$/, '') : path;
  const index = flat.findIndex(item => item.path === clean || item.path === clean + '/');
  return { previous: flat[index - 1] || null, next: index === -1 ? null : flat[index + 1] || null, index };
};
