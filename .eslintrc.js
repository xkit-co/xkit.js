module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint-config-standard-with-typescript',
    // Need to turn off rules, which conflicts with prettier
    'prettier'
  ],
  // Generally it's preferable to stick with ts-standard rules set.
  // If you are adding or disabling anything, please add related comments.
  rules: {
    // will put it back as a part of #646
    '@typescript-eslint/strict-boolean-expressions': 'off',
    // We need to mark async function call in useEffect, since we can't use async functions there
    'no-void': ['error', { allowAsStatement: true }]
  },
  ignorePatterns: ['.eslintrc.js']
}
