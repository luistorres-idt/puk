import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import * as v from 'valibot';
import { defineConfig, loadEnv } from 'vite';

const DevelopmentEnvironmentSchema = v.object({
  VITE_API_PROXY_TARGET: v.pipe(v.string(), v.url()),
  VITE_DEV_PORT: v.pipe(
    v.string(),
    v.regex(/^\d+$/),
    v.transform(Number),
    v.integer(),
    v.minValue(1),
    v.maxValue(65_535),
  ),
});

export default defineConfig(({ mode }) => {
  const environmentDirectory = fileURLToPath(new URL('../..', import.meta.url));
  const environment = loadEnv(mode, environmentDirectory, 'VITE_');
  const developmentEnvironment = v.parse(DevelopmentEnvironmentSchema, {
    VITE_API_PROXY_TARGET:
      process.env['VITE_API_PROXY_TARGET'] ??
      environment['VITE_API_PROXY_TARGET'] ??
      'http://localhost:3000',
    VITE_DEV_PORT: process.env['VITE_DEV_PORT'] ?? environment['VITE_DEV_PORT'] ?? '5173',
  });

  return {
    envDir: environmentDirectory,
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: developmentEnvironment.VITE_DEV_PORT,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: developmentEnvironment.VITE_API_PROXY_TARGET,
        },
        '/health': {
          changeOrigin: true,
          target: developmentEnvironment.VITE_API_PROXY_TARGET,
        },
      },
      strictPort: true,
    },
  };
});
