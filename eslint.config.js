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
];
