# Task: Export from Index Files

**Task ID**: task-14
**Phase**: Phase 4 - Integration & Testing
**Estimated Effort**: 15 minutes
**Verification Level**: L3 (Build Success)

## Overview

Export new components from library index files for external access.

## Target Files

- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\index.ts`

## Implementation

Add to blockchain/src/index.ts:

```typescript
// Services
export * from './services/payout-session.service';

// Events (already exported from events/index.ts)
// PayoutEvents, PayoutStartEvent, PayoutTransactionEvent, PayoutEndEvent, PayoutEndReason
```

## Acceptance Criteria

- [x] PayoutSessionService exported
- [x] All event types exported (via events/index.ts)
- [x] Import from @app/blockchain works
- [x] Build succeeds

## Completion Checklist

- [x] Exports added to index.ts
- [x] Build succeeds
- [x] Imports work correctly
