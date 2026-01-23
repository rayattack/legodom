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
    outfile: 'dist/main.js',
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



  console.log('Build complete! 🧱');
}

build().catch(() => process.exit(1));
