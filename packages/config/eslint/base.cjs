/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: false,
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  env: {
    es2022: true,
    node: true,
  },
  rules: {
    'no-unused-vars': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: [
    'node_modules/',
    'dist/',
    'build/',
    '.next/',
    '.turbo/',
    'coverage/',
  ],
};