# Task: Register Services in Modules

**Task ID**: task-13
**Phase**: Phase 4 - Integration & Testing
**Estimated Effort**: 30 minutes
**Verification Level**: L3 (Build Success)

## Overview

Register PayoutSessionService in BlockchainModule and PayoutListener in TelegramModule.

## Target Files

- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\blockchain.module.ts`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\telegram.module.ts`

## Dependencies

**Depends On**: Task 05 (PayoutSessionService), Task 11 (PayoutListener)

## Implementation

### BlockchainModule

```typescript
import { ScheduleModule } from '@nestjs/schedule';
import { PayoutSessionService } from './services/payout-session.service';

@Module({
  imports: [
    // ... existing imports
    ScheduleModule.forRoot(), // For @Interval decorator
  ],
  providers: [
    // ... existing providers
    PayoutSessionService,
  ],
  exports: [
    // ... existing exports
    PayoutSessionService,
  ],
})
export class BlockchainModule {}
```

### TelegramModule

```typescript
import { PayoutListener } from './listeners/payout.listener';

@Module({
  providers: [
    // ... existing providers
    PayoutListener,
  ],
})
export class TelegramModule {}
```

## Acceptance Criteria

- [x] PayoutSessionService registered in BlockchainModule
- [x] ScheduleModule imported for @Interval
- [x] PayoutListener registered in TelegramModule
- [x] Build succeeds

## Completion Checklist

- [x] BlockchainModule updated
- [x] TelegramModule updated
- [x] ScheduleModule imported
- [x] Build succeeds
