/// <reference types="node" />
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    browser: {
      enabled: true,
      provider: playwright(),
      headless: true,
      instances: [
        { browser: 'webkit' },
        { browser: 'chromium' },
        { browser: 'firefox' },
      ],
    },
  },
});
