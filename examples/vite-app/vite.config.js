import { defineConfig } from 'vite';
import path from 'path';

import legoPlugin from 'lego-dom/vite-plugin';
import tailwindcss from '@tailwindcss/vite';


export default defineConfig({
  plugins: [
    legoPlugin({
      componentsDir: './src/components',
      include: ['**/*.lego'],
      importPath: 'lego-dom/main.js' // Use the alias defined below
    }),
    tailwindcss()
  ],
  resolve: {
    alias: {
      'lego-dom/main.js': path.resolve(__dirname, '../../lego.js')
    }
  }
});
