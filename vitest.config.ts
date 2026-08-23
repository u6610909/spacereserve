import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    env: {
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
    },
    // Test files share one Postgres database, and several call resetDb() in
    // beforeEach — running files in parallel means one file's reset can wipe
    // rows another file is mid-assertion on. Serialize file execution rather
    // than give every test its own isolated database.
    fileParallelism: false,
  },
});
