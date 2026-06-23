import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.js'

// Merge with the main vite config so path aliases (@/auth/*, etc.)
// resolve the same way in tests as in the app. Without this, imports
// like `import { X } from "@/auth/version"` fail with ERR_MODULE_NOT_FOUND.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
      // tests/_gen/** are doc codegen scripts (e.g. roleFeatures.gen) — they
      // WRITE files as a side effect, so they only run when targeted explicitly.
      exclude: ['tests/e2e/**', 'tests/_gen/**', 'node_modules/**'],
      reporters: 'default',
      setupFiles: ['./tests/setup.ts'],
    },
  }),
)
