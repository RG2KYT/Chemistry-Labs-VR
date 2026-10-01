import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// `npm run dev -- --https` (or HTTPS=1) serves over https so a Quest on the same Wi-Fi can
// open the dev server (WebXR requires a secure context).
const https = process.env.HTTPS === '1' || process.argv.includes('--https');

export default defineConfig({
  base: './',
  plugins: https ? [basicSsl()] : [],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: 0,
  },
});
