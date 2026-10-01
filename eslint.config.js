import tseslint from 'typescript-eslint';

export default [
  { ignores: ['node_modules/**', 'coverage/**', 'dist/**', '.superpowers/**'] },
  ...tseslint.configs.recommended,
];
