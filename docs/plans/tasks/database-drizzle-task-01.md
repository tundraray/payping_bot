# Task 01: Install Drizzle ORM Packages

Metadata:
- Phase: Phase 1 - Foundation Setup
- Dependencies: None (first task)
- Provides: Package installations in package.json and pnpm-lock.yaml
- Size: Small (2 files)

## Implementation Content

Install Drizzle ORM packages and postgres.js driver to enable database access functionality. This is the foundational task that all subsequent database implementation depends upon.

**Packages to install**:
- `drizzle-orm` - ORM library for TypeScript
- `postgres` - postgres.js driver (ADR-0002 decision)
- `drizzle-kit` (dev dependency) - Migration generation and management CLI

## Target Files
- [x] package.json (dependencies update)
- [x] pnpm-lock.yaml (lockfile update)

## Implementation Steps

### 1. Install Production Dependencies
- [x] Run: `pnpm add drizzle-orm postgres`
- [x] Verify package.json contains drizzle-orm and postgres in dependencies

### 2. Install Development Dependencies
- [x] Run: `pnpm add -D drizzle-kit`
- [x] Verify package.json contains drizzle-kit in devDependencies

### 3. Verify Installation
- [x] Run: `pnpm install` (to ensure lockfile is updated)
- [x] Verify no dependency conflicts reported
- [x] Check node_modules contains drizzle-orm, postgres, and drizzle-kit

## Completion Criteria
- [x] All three packages installed successfully
- [x] pnpm-lock.yaml updated without conflicts
- [x] `pnpm run build` still succeeds (no breaking changes to existing code)
- [x] Operation verified: L3 (Build Success) - packages available for import

## Notes
- Impact scope: package.json and pnpm-lock.yaml only
- Constraints: Do not modify any source code in this task
- No tests required for package installation
- This task must complete successfully before any other database tasks can proceed
