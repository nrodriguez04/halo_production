module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js'],
  overrides: [
    {
      // tsconfig.json only includes `src/**/*`, so the e2e specs are outside
      // the type-aware program and fail to parse. They don't need
      // type-aware rules — lint them syntactically instead of widening
      // tsconfig (which would also pull them into `tsc --noEmit`).
      files: ['test/**/*.ts'],
      parserOptions: { project: null },
      rules: {
        // `import x = require('supertest')` is the correct CommonJS form for
        // a module without a default export under this tsconfig.
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
  rules: {
    // `_`-prefixed params/vars mark intentionally-unused signature positions.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/interface-name-prefix': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
  },
};

