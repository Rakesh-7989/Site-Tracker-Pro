import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Merge with the main vite config so path aliases (@/auth/*, etc.)
// resolve the same way in tests as in the app. Without this, imports
// like `import { X } from "@/auth/version"` fail with ERR_MODULE_NOT_FOUND.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
      exclude: ['tests/e2e/**', 'node_modules/**'],
      reporters: 'default',
    },
  }),
)
