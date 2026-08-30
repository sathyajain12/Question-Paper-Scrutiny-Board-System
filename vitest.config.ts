import { defineConfig } from 'vitest/config';
import { cloudflareTest } from '@cloudflare/vitest-pool-workers';
import path from 'node:path';

const rootDir = import.meta.dirname;

/**
 * Worker tests execute inside workerd itself, not Node — which is the whole
 * point for the crypto spike: passing here means it passes in production.
 *
 * Note: @cloudflare/vitest-pool-workers 0.21 replaced the old
 * `defineWorkersConfig` helper with this plugin.
 */
export default defineConfig({
  plugins: [
    cloudflareTest({
      miniflare: {
        compatibilityDate: '2026-08-01',
        compatibilityFlags: ['nodejs_compat'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src/client'),
      '@shared': path.resolve(rootDir, './src/shared'),
    },
  },
  test: {
    include: ['src/server/**/*.test.ts', 'src/shared/**/*.test.ts'],
  },
});
