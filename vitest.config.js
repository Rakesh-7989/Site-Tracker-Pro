import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx,ts,tsx}'],
    exclude: ['tests/e2e/**', 'node_modules/**'],
    reporters: 'default',
  },
})
