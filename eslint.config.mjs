// @ts-check

import eslint from '@eslint/js'
import tseslintPkg from 'typescript-eslint'

const tseslint = tseslintPkg.default ?? tseslintPkg
const tseslintConfigs = tseslintPkg.configs ?? tseslint.configs
const eslintConfigs = eslint.configs

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '**/*.d.ts',
      '**/*.js',
    ],
  },
  eslintConfigs.recommended,
  ...tseslintConfigs.recommended,
  {
    languageOptions: {
      globals: {
        Buffer: 'readonly',
        process: 'readonly',
        global: 'readonly',
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'warn',
    },
  },
)
