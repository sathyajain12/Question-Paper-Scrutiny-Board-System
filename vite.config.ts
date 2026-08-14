import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import path from 'node:path';

// `__dirname` does not exist in ESM, and this config is ESM ("type": "module").
const rootDir = import.meta.dirname;

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src/client'),
      '@shared': path.resolve(rootDir, './src/shared'),
    },
  },
  // No build.outDir override: @cloudflare/vite-plugin owns the output layout.
  // It emits the SPA to dist/client and the Worker (plus a generated
  // wrangler.json) to dist/<worker-name>. Overriding outDir nests them wrongly.
});
