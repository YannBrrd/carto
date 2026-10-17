import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // scripts/: build helpers, such as the .env reading of webpack.config.js
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    // Leaflet touches `window` at import time, so renderer code needs a DOM
    environment: 'jsdom',
  },
});
