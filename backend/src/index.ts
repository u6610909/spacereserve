/**
 * Bootstrap order (docs/architecture.md):
 *   Key Vault (Phase 3) -> config -> Prisma (Phase 2) -> Express
 *
 * Nothing may listen on a port before secrets are resolved, so the vault step
 * lands ahead of `createApp()` when Phase 3 arrives.
 */
import { createApp } from './app';
import { config, resolveSecrets } from './config';
import { logger } from './lib/logger';

async function main(): Promise<void> {
  await resolveSecrets();
  const app = createApp();

  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.nodeEnv, basePath: config.basePath },
      'spacereserve listening',
    );
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'shutting down');
    server.close((err) => {
      if (err) {
        logger.error({ err }, 'error during shutdown');
        process.exit(1);
      }
      process.exit(0);
    });
    // Don't hang forever on stuck keep-alive connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
