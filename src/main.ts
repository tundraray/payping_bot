import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown - this handles SIGINT/SIGTERM internally
  // and calls onModuleDestroy lifecycle hooks on all providers
  app.enableShutdownHooks();

  // Windows-specific: Handle SIGBREAK (Ctrl+Break) which is more reliable on Windows
  if (process.platform === 'win32') {
    const readline = await import('node:readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    rl.on('SIGINT', () => {
      process.emit('SIGINT');
    });
  }

  // Start HTTP server for health checks (required by cloud platforms)
  const port = process.env.PORT || 8000;
  await app.listen(port);
}
bootstrap();
