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
      // Coverage scope = the logic layers the unit suite targets (query
      // factories, RBAC/auth, libs, module/plugin catalogs). Views are covered
      // by smoke + e2e, not jsdom unit coverage. Thresholds = measured baseline
      // (2026-08-10) so CI trends coverage up instead of red-flagging existing code.
      coverage: {
        provider: 'v8',
        include: [
          'src/app/**/*.ts',
          'src/auth/**/*.ts',
          'src/lib/**/*.ts',
          'src/modules/**/*.ts',
          'src/plugins/**/*.ts',
        ],
        reporter: ['text', 'html', 'json-summary'],
        reportsDirectory: 'coverage',
        thresholds: {
          lines: 50,
          functions: 50,
          statements: 48,
          branches: 38,
        },
      },
    },
  }),
)
