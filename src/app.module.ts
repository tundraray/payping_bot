import { BlockchainModule } from '@app/blockchain';
import { DbModule } from '@app/db';
import { TelegramModule } from '@app/telegram';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

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
})
export class AppModule {}
