// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: { project: './tsconfig.json' },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      // Hard rule (MASTER_PROMPT §9.3): src/config/ is the ONLY process.env reader.
      // Overridden for src/config/** below. Also enforced by scripts/check-env-guard.sh
      // in CI so disabling this rule alone does not open the door.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message: 'process.env may only be read inside src/config/. Import `config` instead.',
        },
      ],
    },
  },
  {
    files: ['src/config/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
  {
    // Hard rule (MASTER_PROMPT §9.3) governs the app's runtime request path
    // (src/), not one-off CLI tooling. prisma/seed.ts reads PEER_API_KEY_HASH
    // directly by design (CLAUDE.md — "seed.ts uses to insert FinderAI's row").
    files: ['prisma/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' },
  },
);
