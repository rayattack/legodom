import { defineConfig } from 'vite';
import path from 'path';
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
      'lego-dom/main.js': path.resolve(__dirname, '../../lego.js')
    }
  }
});
