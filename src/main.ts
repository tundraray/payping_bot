import { type LogLevel } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

function getLogLevels(): LogLevel[] {
  const isProduction = process.env.NODE_ENV === 'production';

  // Production: info level and above (log, error, warn)
  // Development: all levels including debug
  return isProduction ? ['log', 'error', 'warn'] : ['log', 'error', 'warn', 'debug', 'verbose'];
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: getLogLevels(),
  });

  // Enable graceful shutdown - this handles SIGINT/SIGTERM internally
  // and calls onModuleDestroy lifecycle hooks on all providers
  app.enableShutdownHooks();

  // Start HTTP server for health checks (required by cloud platforms)
  const port = process.env.PORT || 8000;
  await app.listen(port);
}
bootstrap();
