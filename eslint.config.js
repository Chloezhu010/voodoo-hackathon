import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

const readabilityRules = {
  // Readability — see CLAUDE.md
  'max-lines': ['warn', { max: 250, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true, IIFEs: true }],
  complexity: ['warn', 10],
  'max-depth': ['warn', 4],
  'max-params': ['warn', 5],
  'no-magic-numbers': 'off',

  // Correctness
  eqeqeq: ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'no-implicit-globals': 'error',
  'no-implicit-coercion': 'warn',
  'no-param-reassign': ['error', { props: false }],
  'no-shadow': 'off',
  'no-unused-vars': 'off',
  'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],

  // Style hygiene
  'no-nested-ternary': 'error',
  'prefer-template': 'warn',
  'object-shorthand': 'warn',
};

const tsRules = {
  '@typescript-eslint/no-shadow': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],
  '@typescript-eslint/no-explicit-any': 'warn',
};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'tools/**', 'assets/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{js,mjs,ts}'],
    plugins: { import: importPlugin },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        Phaser: 'readonly',
      },
    },
    settings: {
      'import/resolver': {
        node: { extensions: ['.js', '.mjs', '.ts'] },
      },
    },
    rules: {
      ...readabilityRules,
      ...tsRules,
      'import/no-default-export': 'error',
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
    },
  },
  {
    // Pure layer — no Phaser, no DOM, no wall-clock, no global RNG.
    files: ['src/sim/**/*.{js,mjs,ts}', 'src/config/**/*.{js,mjs,ts}'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'Phaser', message: 'Pure systems must not depend on Phaser. Move rendering to entities/scenes.' },
        { name: 'window', message: 'Pure systems must not touch window.' },
        { name: 'document', message: 'Pure systems must not touch document.' },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: 'Use the injected clock from state, not Date.now(). Logic must be deterministic.',
        },
        {
          selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: 'Use the seeded RNG from state.rng, not Math.random(). Logic must be deterministic.',
        },
      ],
    },
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...readabilityRules,
      'no-console': 'off',
    },
  },
  prettier,
];
