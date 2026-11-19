import './setup.js';
import { Lego } from 'lego-dom';
import 'virtual:lego-blocks';

import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/jetbrains-mono';
import './styles/tokens.css';
import './styles/base.css';
import './styles/repl.css';
import './styles/home.css';

import { BASE } from './nav.js';

const route = (path, tag) => {
  Lego.route(BASE + path, tag);
  if (path !== '/' && !path.includes(':')) Lego.route(BASE + path + '/', tag);
};
Lego.route(BASE, 'home-page');
route('/', 'home-page');
route('/learn', 'learn-index');
Lego.route(BASE + '/learn/:chapter/:lesson', 'lesson-page');
route('/play', 'play-page');
// Everything else is a markdown page: /tutorial/, /api/block, ...
Lego.route(BASE + '/:section', 'doc-article');
Lego.route(BASE + '/:section/', 'doc-article');
Lego.route(BASE + '/:section/:page', 'doc-article');

// The router swaps the page; where the viewport sits afterwards is ours.
// A page that loads its content later (doc-article) handles its own #hash.
Lego.watch(globals => globals.$route.url, () => {
  if (!window.location.hash) window.scrollTo(0, 0);
});

Lego.init();
