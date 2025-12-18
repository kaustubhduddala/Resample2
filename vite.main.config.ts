import { defineConfig } from 'vite';
import path from 'node:path';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/main.ts'),
      formats: ['cjs'],
      fileName: () => 'main.cjs',
    },
    rollupOptions: {
      external: (id) => {
        return ['electron', 'electron-squirrel-startup'].includes(id) || id.startsWith('node:');
      },
    },
    outDir: '.vite/build',
  },
});
