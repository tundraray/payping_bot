import { BlockchainModule } from '@app/blockchain';
import { DbModule } from '@app/db';
import { TelegramModule } from '@app/telegram';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    DbModule,
    BlockchainModule,
    TelegramModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
