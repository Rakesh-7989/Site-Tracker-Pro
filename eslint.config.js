// SiteTrack Pro — ESLint flat config (ESLint 9+)
//
// Goals:
// - Catch obvious React/Hooks bugs (deps, key, no-unused-vars).
// - Stay practical for a 2,200-line single-file App.jsx — many rules are
//   warnings, not errors, so the lint step does not block the build while
//   we refactor.
// - No formatting opinions (Prettier handles that).

import js from "@eslint/js";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "package-lock.json",
      // Capacitor native shell: generated + copied web bundle — never lint.
      "android/**",
      "ios/**",
      // Deno runtime edge functions — separate platform, own review gates.
      "supabase/functions/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        ...globals.browser,
        ...globals.node,
        // Service worker globals used in public/sw.js
        self: "readonly",
        caches: "readonly",
        fetch: "readonly",
      },
    },
    settings: { react: { version: "18" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      // React
      "react/jsx-uses-react": "error",
      "react/jsx-uses-vars": "error",
      "react/jsx-key": "warn",
      "react/no-unescaped-entities": "off",
      "react/prop-types": "off",
      "react/react-in-jsx-scope": "off",

      // Hooks
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // Practical for current codebase — many local helpers + intentional shadows
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "no-prototype-builtins": "off",
      "no-undef": "error",
    },
  },
  {
    // Test files
    files: ["tests/**/*.{js,jsx}"],
    languageOptions: { globals: { ...globals.node, describe: "readonly", test: "readonly", it: "readonly", expect: "readonly", vi: "readonly", beforeEach: "readonly", afterEach: "readonly", beforeAll: "readonly", afterAll: "readonly" } },
  },
  {
    // Build/script files (Node runtime — incl. doc-build scripts)
    files: [
      "scripts/**/*.{js,mjs}",
      "docs/**/*.{js,mjs}",
      "*.config.js",
      "*.config.mjs",
    ],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // TypeScript sources (src/ + tests/): real parser + recommended rules.
  // Without this block ESLint silently skipped every .ts/.tsx file.
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ["**/*.{ts,tsx}"],
  })),
  {
    // Custom hook engines live in .ts too — hooks rules must cover both.
    files: ["**/*.{ts,tsx}"],
    languageOptions: { globals: { ...globals.browser } },
    settings: { react: { version: "18" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      "react/jsx-key": "warn",
      "react-hooks/rules-of-hooks": "warn", // TEMPORARY baseline (~90 early-return-before-hooks sites) — burn down to "error" in the typed-boundary phase
      "react-hooks/exhaustive-deps": "warn",
      "react/no-unescaped-entities": "off",
      "react/react-in-jsx-scope": "off",
      "no-unused-vars": "off", // @typescript-eslint/no-unused-vars owns this
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      // Documented debt (707 `any`s): paid down by the typed Supabase boundary
      // phase — kept visible as warnings so new `any`s still count against the
      // --max-warnings budget.
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
];
