import { defineConfig } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import lego from '../vite-plugin.js';
import markdown from './plugins/markdown.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const { version } = JSON.parse(readFileSync(path.join(repo, 'package.json'), 'utf8'));

// The docs site is a LegoDOM app. It runs the build in dist/, the same file
// that is published to npm, so the site is always a test of the release.
export default defineConfig({
  root: here,
  base: '/legodom/',
  publicDir: path.join(repo, 'docs/public'),
  define: { __LEGO_VERSION__: JSON.stringify(version) },
  resolve: {
    alias: { 'lego-dom': path.join(repo, 'dist/lego.mjs') }
  },
  plugins: [
    lego({ blocksDir: './src/blocks' }),
    markdown({ docsDir: path.join(repo, 'docs'), base: '/legodom/' })
  ],
  server: { fs: { allow: [repo] } },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true, target: 'es2020' }
});
