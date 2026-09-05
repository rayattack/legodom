import esbuild from 'esbuild';
import fs from 'fs';

const isDev = process.argv.includes('--dev');

// Common options
const common = {
  entryPoints: ['src/index.js'],
  bundle: true,
  target: 'es2020',
};

async function build() {
  console.log('Building LegoDOM...');

  // 1. IIFE Build (Browser / CDN) - Replaces original main.js
  await esbuild.build({
    ...common,
    format: 'iife',
    outfile: 'dist/lego.min.js',
    minify: !isDev,
    sourcemap: isDev,
  });

  // 2. ESM Build (Bundlers)
  await esbuild.build({
    ...common,
    format: 'esm',
    outfile: 'dist/lego.mjs',
    minify: !isDev,
    sourcemap: isDev,
  });

  // 3. Server build (lego-dom/server). Node only, and deliberately not
  // minified: this runs on the author's server, where a readable stack trace
  // is worth more than a few kilobytes.
  await esbuild.build({
    entryPoints: ['src/server/index.js'],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    outfile: 'dist/lego.server.mjs',
    minify: false,
    sourcemap: isDev,
  });

  // 4. Copy TypeScript declarations
  fs.copyFileSync('src/lego.d.ts', 'dist/lego.d.ts');
  fs.copyFileSync('src/server/index.d.ts', 'dist/lego.server.d.ts');

  console.log('Build complete! 🧱');
}

build().catch(() => process.exit(1));
