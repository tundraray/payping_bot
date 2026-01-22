import { BlockchainModule } from '@app/blockchain';
import { DbModule } from '@app/db';
import { Module } from '@nestjs/common';

@Module({
  imports: [DbModule, BlockchainModule],
})
export class AppModule {}
