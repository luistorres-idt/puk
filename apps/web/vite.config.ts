import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const environmentDirectory = fileURLToPath(new URL('../..', import.meta.url));
  const environment = loadEnv(mode, environmentDirectory, 'VITE_');
  const apiProxyTarget = environment['VITE_API_PROXY_TARGET'] ?? 'http://localhost:3000';

  return {
    envDir: environmentDirectory,
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          changeOrigin: true,
          target: apiProxyTarget,
        },
        '/health': {
          changeOrigin: true,
          target: apiProxyTarget,
        },
      },
    },
  };
});
