import { defineConfig } from 'vite';
import lego from 'lego-dom/vite-plugin';
import path from 'path';

export default defineConfig({
  plugins: [
    lego({
      include: ['**/*.lego']
    })
  ],
  build: {
    minify: 'esbuild',
    lib: {
      entry: path.resolve(__dirname, 'src/lego-studio.lego'),
      name: 'LegoStudio',
      fileName: (format) => `lego-studio.${format === 'es' ? 'js' : format}`
    },
    rollupOptions: {
      // Make sure externalize deps that shouldn't be bundled
      external: ['lego-dom'],
      output: {
        globals: {
          'lego-dom': 'Lego'
        }
      }
    }
  }
});
