import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable graceful shutdown - this handles SIGINT/SIGTERM internally
  // and calls onModuleDestroy lifecycle hooks on all providers
  app.enableShutdownHooks();

  // Start HTTP server for health checks (required by cloud platforms)
  const port = process.env.PORT || 8000;
  await app.listen(port);
}
bootstrap();
