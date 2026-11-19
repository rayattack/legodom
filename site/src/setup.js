// Runs before any block is registered. Importing the blocks defines their
// custom elements, and the ones already in index.html mount on the spot, so
// everything a template reads from `global` has to exist by then.
import { Lego } from 'lego-dom';
import { loadProgress } from './lib/progress.js';

// A statically hosted copy of a page is served as /page.html. The router
// matches paths, so settle on the clean form before it looks.
if (/\.html$/.test(window.location.pathname)) {
  history.replaceState(null, '', window.location.pathname.replace(/\.html$/, '') + window.location.search + window.location.hash);
}

// Shared, reactive state for the chrome: every block reads the same object.
Lego.globals.site = {
  dark: document.documentElement.classList.contains('dark'),
  searchOpen: false
};
loadProgress();

Lego.config.strict = import.meta.env.DEV;
