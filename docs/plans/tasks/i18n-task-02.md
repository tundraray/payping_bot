# Task: Create i18n Utils for Event Handlers

**Task ID**: i18n-task-02
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 2-3 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Create a utility to load Fluent bundles outside grammY context for use in event handlers. TransactionListener needs to send localized notifications but doesn't have access to grammY's context object (ctx.t). This utility provides a standalone translation function.

## Context

The telegram module uses `@grammyjs/i18n` plugin, which provides `ctx.t()` for handlers with grammY context. However, event listeners (like TransactionListener) don't have context when processing blockchain events. We need a separate utility to load Fluent resources and translate messages.

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\utils\i18n.utils.ts`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\utils\i18n.utils.spec.ts`

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\utils\index.ts` (add export)

## Dependencies

**Depends On**:
- Task 03 (locale files) - for testing with real locale keys

**Blocks**:
- Task 10 (Update TransactionListener) - uses translate() function

## Implementation Steps

### Step 1: Install dependencies (if needed)

Check if `@fluent/bundle` is already installed (likely via `@grammyjs/i18n`):

```bash
pnpm list @fluent/bundle
```

If not installed:
```bash
pnpm add @fluent/bundle
```

### Step 2: Create i18n.utils.ts

Create `libs/telegram/src/utils/i18n.utils.ts`:

```typescript
import { FluentBundle, FluentResource } from '@fluent/bundle';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Cache for loaded Fluent bundles to avoid repeated file I/O.
 */
const bundleCache = new Map<string, FluentBundle>();

/**
 * Supported locales in the application.
 */
const SUPPORTED_LOCALES = ['en', 'ru', 'uk'] as const;
type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Default fallback locale.
 */
const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Load a Fluent bundle for the given locale.
 *
 * @param locale - Language code (e.g., 'en', 'ru', 'uk')
 * @returns FluentBundle instance
 * @throws Error if locale file cannot be read
 */
function loadBundle(locale: string): FluentBundle {
  // Check cache first
  if (bundleCache.has(locale)) {
    return bundleCache.get(locale)!;
  }

  // Determine path to locale file
  const localesDir = join(__dirname, '..', 'locales');
  const filePath = join(localesDir, `${locale}.ftl`);

  // Read and parse Fluent resource
  const ftlContent = readFileSync(filePath, 'utf-8');
  const resource = new FluentResource(ftlContent);

  // Create bundle
  const bundle = new FluentBundle(locale);
  const errors = bundle.addResource(resource);

  // Log errors but don't throw (allow partial loading)
  if (errors.length > 0) {
    console.warn(`Fluent resource errors for locale ${locale}:`, errors);
  }

  // Cache and return
  bundleCache.set(locale, bundle);
  return bundle;
}

/**
 * Translate a message key using Fluent.
 *
 * @param languageCode - User's language code (e.g., 'en', 'ru', 'uk')
 * @param key - Message key from .ftl file
 * @param params - Optional parameters for interpolation
 * @returns Translated message string
 *
 * @example
 * translate('en', 'welcome') // "👋 Welcome to PayPing!..."
 * translate('ru', 'notification', { amount: '1,234.56' })
 */
export function translate(
  languageCode: string | null | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  // Normalize language code
  const normalizedLang = languageCode?.toLowerCase().slice(0, 2);

  // Determine locale to use (with fallback)
  let locale: string = DEFAULT_LOCALE;
  if (normalizedLang && SUPPORTED_LOCALES.includes(normalizedLang as SupportedLocale)) {
    locale = normalizedLang;
  }

  // Load bundle
  let bundle: FluentBundle;
  try {
    bundle = loadBundle(locale);
  } catch (error) {
    console.error(`Failed to load locale ${locale}, falling back to ${DEFAULT_LOCALE}`, error);
    bundle = loadBundle(DEFAULT_LOCALE);
  }

  // Get message
  const message = bundle.getMessage(key);
  if (!message || !message.value) {
    console.warn(`Missing translation for key "${key}" in locale "${locale}"`);
    return key; // Return key as fallback
  }

  // Format message with parameters
  const formatted = bundle.formatPattern(message.value, params);
  return formatted;
}

/**
 * Clear the bundle cache (useful for testing).
 */
export function clearBundleCache(): void {
  bundleCache.clear();
}
```

### Step 3: Create unit tests

Create `libs/telegram/src/utils/i18n.utils.spec.ts`:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { translate, clearBundleCache } from './i18n.utils';

describe('i18n.utils', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure fresh loading
    clearBundleCache();
  });

  describe('translate', () => {
    it('should translate English message', () => {
      const result = translate('en', 'welcome');
      expect(result).toContain('Welcome to PayPing');
    });

    it('should translate Russian message', () => {
      const result = translate('ru', 'welcome');
      expect(result).toContain('Добро пожаловать');
    });

    it('should translate Ukrainian message', () => {
      const result = translate('uk', 'welcome');
      expect(result).toContain('Ласкаво просимо');
    });

    it('should interpolate parameters', () => {
      const result = translate('en', 'analytics-no-history', {
        currentAmount: '1,234.56',
      });
      expect(result).toContain('1,234.56');
    });

    it('should fallback to English for unknown locale', () => {
      const result = translate('fr', 'welcome');
      expect(result).toContain('Welcome to PayPing'); // English fallback
    });

    it('should fallback to English for null languageCode', () => {
      const result = translate(null, 'welcome');
      expect(result).toContain('Welcome to PayPing');
    });

    it('should fallback to English for undefined languageCode', () => {
      const result = translate(undefined, 'welcome');
      expect(result).toContain('Welcome to PayPing');
    });

    it('should return key if translation missing', () => {
      const result = translate('en', 'nonexistent-key');
      expect(result).toBe('nonexistent-key');
    });

    it('should normalize language codes', () => {
      // Should accept 'uk-UA' and normalize to 'uk'
      const result = translate('uk-UA', 'welcome');
      expect(result).toContain('Ласкаво просимо');
    });

    it('should cache bundles for performance', () => {
      // First call loads from file
      const result1 = translate('en', 'welcome');
      // Second call should use cache (same result, faster)
      const result2 = translate('en', 'welcome');
      expect(result1).toBe(result2);
    });
  });
});
```

### Step 4: Update barrel export

Update `libs/telegram/src/utils/index.ts`:

```typescript
export * from './format.utils';
export * from './i18n.utils';
```

### Step 5: Run tests

```bash
pnpm test libs/telegram/src/utils/i18n.utils.spec.ts
```

### Step 6: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [ ] `translate('en', 'welcome')` returns English welcome message (AC-8.3)
- [ ] `translate('ru', 'welcome')` returns Russian welcome message (AC-8.3)
- [ ] `translate('uk', 'welcome')` returns Ukrainian welcome message (AC-8.3)
- [ ] `translate('unknown', 'welcome')` falls back to English (AC-8.4)
- [ ] `translate(null, 'welcome')` falls back to English (AC-8.4)
- [ ] Supports parameter interpolation
- [ ] All unit tests pass (10+ test cases)
- [ ] Build succeeds without errors
- [ ] No lint errors

## Verification Steps

1. Run unit tests: `pnpm test libs/telegram/src/utils/i18n.utils.spec.ts`
2. Verify all 3 locales load correctly
3. Verify fallback behavior for unknown/null locale
4. Run build: `pnpm build`
5. Run lint: `pnpm lint`

## Edge Cases to Test

- Unknown locale code → fallback to 'en'
- Null/undefined languageCode → fallback to 'en'
- Language code with region (e.g., 'uk-UA') → normalize to 'uk'
- Missing translation key → return key as fallback
- Bundle caching → same locale doesn't reload file
- Fluent resource parsing errors → log warning, continue

## Technical Decisions

**Why FluentBundle instead of grammY i18n?**
- grammY i18n requires ctx object (not available in event handlers)
- FluentBundle provides lower-level API for standalone translation
- Reuses same .ftl files as grammY i18n (consistency)

**Why cache bundles?**
- File I/O is expensive (readFileSync)
- Bundles are immutable once loaded
- TransactionListener processes many events (cache improves performance)

**Why allow partial resource loading?**
- Some .ftl syntax errors shouldn't block entire app
- Log warnings for debugging
- Graceful degradation (missing keys return key as fallback)

## Notes

- **Fluent syntax**: Uses same .ftl files as grammY i18n plugin
- **Fallback chain**: unknownLocale → 'en', missingKey → key itself
- **Cache management**: clearBundleCache() for testing only
- **Error handling**: Logs errors, never throws (fail-safe)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (Integration Point 3)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 1.2)
- Fluent Syntax: https://projectfluent.org/fluent/guide/
- grammY i18n Plugin: https://grammy.dev/plugins/i18n

## Completion Checklist

- [ ] i18n.utils.ts created with translate function
- [ ] Bundle caching implemented
- [ ] Fallback logic for unknown locales
- [ ] i18n.utils.spec.ts created with 10+ test cases
- [ ] Barrel export updated
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] Documentation comments complete
