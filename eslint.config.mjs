import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import mods from './tools/eslint-mods.mjs'

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.nx/**',
      '**/.claude-plugin/types/**',
      'tools/claude-code-types/**',
      'design/**',
      'mods/*/src/_kit/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { h: 'readonly', Fragment: 'readonly' },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['mods/*/hooks/**/*.{ts,tsx}', 'mods/*/src/**/*.{ts,tsx}'],
    plugins: { mods },
    rules: { 'mods/hook-params': 'error', 'mods/no-alias-engine': 'error' },
  },
  {
    files: ['mods/*/src/**/*.{ts,tsx}'],
    plugins: { mods },
    rules: { 'mods/no-engine-in-src': 'error' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/*.mjs'],
    languageOptions: { globals: globals.node },
  },
)
