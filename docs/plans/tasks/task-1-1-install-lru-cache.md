# Task: Install lru-cache Dependency

Metadata:
- Phase: 1 (Foundation)
- Dependencies: None
- Provides: lru-cache package available for Phase 2
- Size: Small (1 file: package.json)

## Implementation Content
Install the `lru-cache` npm package required for the DeduplicationService in Phase 2. This is a prerequisite task that must complete before any service implementation.

## Target Files
- [x] `package.json` (modified by pnpm)

## Implementation Steps

### 1. Install Package
```bash
pnpm add lru-cache
```

### 2. Verify Installation
```bash
# Check package.json includes lru-cache
grep "lru-cache" package.json

# Verify node_modules installation
ls node_modules/lru-cache
```

### 3. Verify TypeScript Types
```bash
# lru-cache includes built-in TypeScript types
# No separate @types package needed
```

## Completion Criteria
- [x] `lru-cache` appears in `package.json` dependencies
- [x] `pnpm-lock.yaml` updated with lru-cache entry
- [x] `node_modules/lru-cache` directory exists
- [x] Operation verified: L3 (Build Success) - `pnpm run build` passes

## Related Acceptance Criteria
- AC-4.4: The LRU cache shall have a configurable maximum size (default: 10000 entries)

## Notes
- Impact scope: package.json, pnpm-lock.yaml only
- Constraints: No code changes in this task
- lru-cache is a widely-used, battle-tested library (referenced in Design Doc)
- Package URL: https://www.npmjs.com/package/lru-cache
