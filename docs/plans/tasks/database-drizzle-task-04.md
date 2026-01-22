# Task 04: Create DTO Type Definitions

Metadata:
- Phase: Phase 2 - Schema Definitions
- Dependencies: Task 03 (schema tables must be defined)
- Provides: libs/db/src/types/dto.ts
- Size: Small (1 file)

## Implementation Content

Create Data Transfer Object (DTO) type definitions for service method inputs. These DTOs define the contracts for creating and updating domain entities.

**DTOs to define**:
1. `CreateUserDto` - For user creation
2. `UpdateUserDto` - For user updates
3. `CreatePaymentDto` - For payment recording

## Target Files
- [ ] libs/db/src/types/dto.ts

## Implementation Steps

### 1. Create types Directory
- [ ] Create directory: `libs/db/src/types/`

### 2. Define User DTOs
- [ ] Create CreateUserDto interface:
  - telegramId: number (required)
  - username?: string | null (optional)
  - firstName?: string | null (optional)
  - lastName?: string | null (optional)
- [ ] Create UpdateUserDto interface:
  - username?: string | null (optional)
  - firstName?: string | null (optional)
  - lastName?: string | null (optional)
- [ ] Reference Design Doc DTO type definitions section

### 3. Define Payment DTO
- [ ] Create CreatePaymentDto interface:
  - userId: number (required)
  - telegramPaymentChargeId: string (required)
  - amount: number (required)
  - currency?: string (optional, defaults to 'XTR')
  - status: 'pending' | 'completed' | 'failed' | 'refunded' (required)
- [ ] Reference Design Doc DTO type definitions section

### 4. Verify Type Exports
- [ ] Export all three DTO interfaces
- [ ] Ensure types match service method signatures in Design Doc

## Completion Criteria
- [ ] dto.ts file created with all three DTO interfaces
- [ ] All DTO properties match Design Doc specifications
- [ ] File compiles without TypeScript errors
- [ ] `pnpm run build` succeeds
- [ ] Operation verified: L3 (Build Success) - types can be imported by services

## Notes
- Impact scope: Type definitions only, no runtime code
- Constraints: Do not implement services yet
- These DTOs will be used by services in Phase 4 (Tasks 07-10)
- DTO structure must match service method signatures in Design Doc
- Subscription DTOs not needed (services use direct parameters)
