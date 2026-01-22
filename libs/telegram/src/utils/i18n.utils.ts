import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FluentBundle, FluentResource } from '@fluent/bundle';

/**
 * Cache for loaded Fluent bundles to avoid repeated file I/O.
 */
const bundleCache = new Map<string, FluentBundle>();

/**
 * Supported locales in the application.
 */
export const SUPPORTED_LOCALES = ['en', 'ru', 'uk'] as const;
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Default fallback locale.
 */
export const DEFAULT_LOCALE: SupportedLocale = 'en';

/**
 * Check if a locale is supported.
 */
export function isSupportedLocale(locale: string | null | undefined): locale is SupportedLocale {
  return SUPPORTED_LOCALES.includes(locale as SupportedLocale);
}

/**
 * Get a valid locale, falling back to default if not supported.
 */
export function getValidLocale(locale: string | null | undefined): SupportedLocale {
  return isSupportedLocale(locale) ? locale : DEFAULT_LOCALE;
}

/**
 * Get the path to the locales directory.
 * Tries dist/locales first (production), then source path (development/testing).
 */
function getLocalesDir(): string {
  // Production path: dist/locales (webpack copies locales here)
  const distPath = join(process.cwd(), 'dist', 'locales');
  if (existsSync(distPath)) {
    return distPath;
  }

  // Development/testing path: relative to source
  const sourcePath = join(__dirname, '..', 'locales');
  return sourcePath;
}

/**
 * Load a Fluent bundle for the given locale.
 *
 * @param locale - Language code (e.g., 'en', 'ru', 'uk')
 * @returns FluentBundle instance
 * @throws Error if locale file cannot be read
 */
function loadBundle(locale: string): FluentBundle {
  // Check cache first
  const cachedBundle = bundleCache.get(locale);
  if (cachedBundle) {
    return cachedBundle;
  }

  // Determine path to locale file
  const localesDir = getLocalesDir();
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
 * This is useful for event handlers (like TransactionListener) that don't have
 * access to the grammY context but need to send localized messages.
 *
 * @param languageCode - User's language code (e.g., 'en', 'ru', 'uk', 'uk-UA')
 * @param key - Message key from .ftl file
 * @param params - Optional parameters for interpolation
 * @returns Translated message string
 *
 * @example
 * translate('en', 'welcome') // "Welcome to PayPing!..."
 * translate('ru', 'notification-amount', { amount: '1,234.56' })
 * translate('uk-UA', 'welcome') // Normalizes to 'uk', returns Ukrainian
 * translate(null, 'welcome') // Falls back to English
 */
export function translate(
  languageCode: string | null | undefined,
  key: string,
  params?: Record<string, string | number>,
): string {
  // Normalize language code (e.g., 'uk-UA' -> 'uk')
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
