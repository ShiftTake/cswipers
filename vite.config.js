import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'node:path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    define: {
      'process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY': JSON.stringify(env.REACT_APP_STRIPE_PUBLISHABLE_KEY || '')
    },
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          admin: resolve(__dirname, 'admin.html'),
          adminmanagement: resolve(__dirname, 'adminmanagement.html'),
          terms: resolve(__dirname, 'terms.html')
        }
      }
    }
  };
});