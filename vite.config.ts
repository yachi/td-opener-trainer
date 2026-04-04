import { defineConfig } from 'vite';

export default defineConfig({
  base: '/td-opener-trainer/',
  root: '.',
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
