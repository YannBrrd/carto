import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    // Leaflet touches `window` at import time, so renderer code needs a DOM
    environment: 'jsdom',
  },
});
