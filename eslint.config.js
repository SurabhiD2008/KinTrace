import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'test-results', 'playwright-report', 'node_modules', '.planning', 'reports', '.stryker-tmp'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Family data is never logged.
      'no-console': 'error',
      // Leaving fields out of a copy by destructuring them is the typed way to omit them.
      '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
    },
  },
  { files: ['src/**/*.{ts,tsx}'], ...reactRefresh.configs.vite() },
  {
    // The domain is pure and deterministic: no clock, no randomness, no React.
    files: ['src/domain/**/*.ts', 'src/guidelines/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'Date', 'performance', 'crypto'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random' }],
      'no-restricted-imports': ['error', { patterns: ['react', 'react-*', 'zustand', 'zustand/*'] }],
    },
  },
  {
    files: ['*.config.{js,ts}', 'api/**/*.ts', 'scripts/**/*.mjs'],
    languageOptions: { globals: { ...globals.node } },
  },
);
