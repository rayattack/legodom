import { defineConfig } from 'vite';
import legoPlugin from 'lego-dom/vite-plugin';

export default defineConfig({
  plugins: [
    legoPlugin({
      componentsDir: './src/components',
      include: ['**/*.lego']
    })
  ],
  resolve: {
    alias: {
      'lego-dom/main.js': new URL('../../main.js', import.meta.url).pathname
    }
  }
});
