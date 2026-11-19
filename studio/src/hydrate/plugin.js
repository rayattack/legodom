/**
 * The server half of the hydration panel, served by the dev server.
 *
 * The panel needs two renderings of one story: the one the browser produced,
 * which it asks the preview for over PROTOCOL.SERIALIZE, and the one Node
 * produced, which is this. Both have to come from the same definitions or the
 * comparison is between two different applications and means nothing, so this
 * plugin never runs `discover()` of its own. It reads the manifest the
 * virtual modules are already serving, which is also what makes an edit to a
 * `.lego` file show up on both sides at once.
 *
 * Everything except the middleware is a plain function over a manifest, so
 * `cli/build.js` can pre-render the same answers into static JSON and the
 * panel keeps working with no server behind it.
 */

import { createStoryRenderer } from '../core/render.js';

/** Where the dev server answers. The panel builds its URLs from this. */
export const SSR_ROUTE = '/__lego-studio/ssr';

/** Where `cli/build.js` writes the same answers, relative to the output root. */
export const SSR_STATIC_DIR = '__lego-studio/ssr';

/** The plugin whose api holds the manifest the preview and manager both read. */
const VIRTUAL_PLUGIN = 'lego-studio:virtual';

/**
 * One renderer per manifest, keyed on the manifest object itself. Registering
 * every block in `manifest.order` is not free and a story is re-rendered on
 * every panel open, while `studioVirtuals` replaces the whole manifest object
 * when a file changes, so object identity is already exactly the right cache
 * key and there is nothing to invalidate by hand.
 */
const renderers = new WeakMap();

const rendererFor = (manifest) => {
  const cached = renderers.get(manifest);
  if (cached) return cached;
  const built = createStoryRenderer(manifest);
  renderers.set(manifest, built);
  return built;
};

/**
 * The story with this id, or null.
 *
 * A bare tag is accepted as shorthand for that block's first story, matching
 * what the preview runtime accepts, so the two halves answer to the same set
 * of identifiers.
 */
export const findStory = (manifest, id) => {
  const blocks = (manifest && manifest.blocks) || {};
  const order = (manifest && manifest.order) || Object.keys(blocks);
  for (const tag of order) {
    const stories = (blocks[tag] && blocks[tag].stories) || [];
    for (const story of stories) {
      if (story && story.id === id) return story;
    }
  }
  const direct = blocks[id];
  if (direct && direct.stories && direct.stories.length) return direct.stories[0];
  return null;
};

/**
 * Render one story to HTML.
 *
 * A failure is a value rather than a throw. The panel is a diagnostic, and a
 * block whose logic will not evaluate is exactly the case it exists to
 * report, so the message has to travel to the browser rather than end up in
 * a terminal nobody is looking at.
 *
 * @param {object} manifest
 * @param {string} storyId
 * @returns {{html: ?string, error: ?string}}
 */
export function renderStoryHTML(manifest, storyId) {
  const story = findStory(manifest, storyId);
  if (!story) return { html: null, error: `No story "${storyId}" in the manifest.` };
  try {
    return { html: rendererFor(manifest).render(story), error: null };
  } catch (err) {
    return { html: null, error: err && err.message ? err.message : String(err) };
  }
}

/**
 * Every story in the manifest, keyed by id. Used by the static build, where
 * there is no server left to ask.
 *
 * @param {object} manifest
 * @returns {Record<string, {html: ?string, error: ?string}>}
 */
export function renderAllStories(manifest) {
  const out = {};
  const blocks = (manifest && manifest.blocks) || {};
  const order = (manifest && manifest.order) || Object.keys(blocks);
  for (const tag of order) {
    for (const story of (blocks[tag] && blocks[tag].stories) || []) {
      out[story.id] = renderStoryHTML(manifest, story.id);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * The middleware
 * ------------------------------------------------------------------ */

const sendJSON = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // The manifest changes under the panel as files are edited, and a cached
  // answer would show the previous file's markup next to the current file's
  // DOM, which is the one wrong answer this panel must never give.
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.end(payload);
};

/**
 * `GET /__lego-studio/ssr?story=<id>` -> `{ html, error }`.
 *
 * @param {object} [options]
 * @param {() => (object|Promise<object>)} [options.manifest] - the manifest
 *   getter. Left out, the plugin borrows the one `studioVirtuals` exposes on
 *   its own api, so the dev server needs no extra wiring to keep the two in
 *   step.
 * @returns {import('vite').Plugin}
 */
export function hydrationSSR(options = {}) {
  let getManifest = typeof options.manifest === 'function' ? options.manifest : null;

  return {
    name: 'lego-studio:ssr',

    configResolved(config) {
      if (getManifest) return;
      const sibling = (config.plugins || []).find((plugin) => plugin && plugin.name === VIRTUAL_PLUGIN);
      const api = sibling && sibling.api;
      if (api && typeof api.manifest === 'function') {
        getManifest = api.manifest;
        return;
      }
      console.warn(
        `[lego-studio] ${VIRTUAL_PLUGIN} is not in the plugin list, so ${SSR_ROUTE} has ` +
        'no manifest to render from. The hydration panel will report that.'
      );
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url || '/';
        const q = raw.indexOf('?');
        const pathname = q === -1 ? raw : raw.slice(0, q);
        if (pathname !== SSR_ROUTE) return next();

        const params = new URLSearchParams(q === -1 ? '' : raw.slice(q + 1));
        const storyId = params.get('story');
        if (!storyId) {
          sendJSON(res, 400, { html: null, error: 'Ask for a story: ?story=<id>' });
          return;
        }
        if (!getManifest) {
          sendJSON(res, 500, { html: null, error: 'No manifest is available to render from.' });
          return;
        }

        Promise.resolve()
          .then(() => getManifest())
          .then((manifest) => {
            const answer = renderStoryHTML(manifest, storyId);
            sendJSON(res, answer.html === null ? 404 : 200, answer);
          })
          .catch((err) => {
            sendJSON(res, 500, { html: null, error: err && err.message ? err.message : String(err) });
          });
      });
    }
  };
}

export default hydrationSSR;
