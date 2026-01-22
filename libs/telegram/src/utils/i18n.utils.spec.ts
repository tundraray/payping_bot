import {
  clearBundleCache,
  DEFAULT_LOCALE,
  getValidLocale,
  isSupportedLocale,
  SUPPORTED_LOCALES,
  translate,
} from './i18n.utils';

describe('i18n.utils', () => {
  beforeEach(() => {
    // Clear cache before each test to ensure fresh loading
    clearBundleCache();
  });

  describe('SUPPORTED_LOCALES', () => {
    it('should contain en, ru, uk', () => {
      expect(SUPPORTED_LOCALES).toContain('en');
      expect(SUPPORTED_LOCALES).toContain('ru');
      expect(SUPPORTED_LOCALES).toContain('uk');
    });

    it('should have exactly 3 locales', () => {
      expect(SUPPORTED_LOCALES).toHaveLength(3);
    });
  });

  describe('DEFAULT_LOCALE', () => {
    it('should be en', () => {
      expect(DEFAULT_LOCALE).toBe('en');
    });
  });

  describe('isSupportedLocale', () => {
    it('should return true for supported locales', () => {
      expect(isSupportedLocale('en')).toBe(true);
      expect(isSupportedLocale('ru')).toBe(true);
      expect(isSupportedLocale('uk')).toBe(true);
    });

    it('should return false for unsupported locales', () => {
      expect(isSupportedLocale('de')).toBe(false);
      expect(isSupportedLocale('fr')).toBe(false);
      expect(isSupportedLocale('es')).toBe(false);
    });

    it('should return false for null/undefined', () => {
      expect(isSupportedLocale(null)).toBe(false);
      expect(isSupportedLocale(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSupportedLocale('')).toBe(false);
    });
  });

  describe('getValidLocale', () => {
    it('should return the locale if supported', () => {
      expect(getValidLocale('en')).toBe('en');
      expect(getValidLocale('ru')).toBe('ru');
      expect(getValidLocale('uk')).toBe('uk');
    });

    it('should return default locale for unsupported locales', () => {
      expect(getValidLocale('de')).toBe('en');
      expect(getValidLocale('fr')).toBe('en');
    });

    it('should return default locale for null/undefined', () => {
      expect(getValidLocale(null)).toBe('en');
      expect(getValidLocale(undefined)).toBe('en');
    });
  });

  describe('translate', () => {
    describe('basic translation', () => {
      it('should translate English welcome message', () => {
        const result = translate('en', 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should translate Russian welcome message', () => {
        const result = translate('ru', 'welcome');
        expect(result).toContain('Добро пожаловать');
      });

      it('should translate Ukrainian welcome message', () => {
        const result = translate('uk', 'welcome');
        expect(result).toContain('Ласкаво просимо');
      });
    });

    describe('parameter interpolation', () => {
      it('should interpolate currentAmount parameter', () => {
        const result = translate('en', 'analytics-no-history', {
          currentAmount: '1,234.56',
        });
        expect(result).toContain('1,234.56');
        expect(result).toContain('This month');
      });

      it('should interpolate multiple parameters in notification', () => {
        const result = translate('en', 'notification', {
          amount: '500.00',
          monthTotal: '1,500.00',
          expectedAmount: '3,000.00',
          time: '12:00',
          hash: '0xabc123',
        });
        expect(result).toContain('500.00');
        expect(result).toContain('1,500.00');
        expect(result).toContain('Funds received');
      });

      it('should handle numeric parameters in analytics-with-history', () => {
        const result = translate('en', 'analytics-with-history', {
          currentAmount: '1,000.00',
          expectedAmount: '2,000.00',
          months: 3,
        });
        expect(result).toContain('3');
        expect(result).toContain('1,000.00');
        expect(result).toContain('2,000.00');
      });
    });

    describe('fallback behavior', () => {
      it('should fallback to English for unknown locale', () => {
        const result = translate('fr', 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should fallback to English for null languageCode', () => {
        const result = translate(null, 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should fallback to English for undefined languageCode', () => {
        const result = translate(undefined, 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should fallback to English for empty string languageCode', () => {
        const result = translate('', 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should return key if translation is missing', () => {
        const result = translate('en', 'nonexistent-key');
        expect(result).toBe('nonexistent-key');
      });
    });

    describe('language code normalization', () => {
      it('should normalize uk-UA to uk', () => {
        const result = translate('uk-UA', 'welcome');
        expect(result).toContain('Ласкаво просимо');
      });

      it('should normalize ru-RU to ru', () => {
        const result = translate('ru-RU', 'welcome');
        expect(result).toContain('Добро пожаловать');
      });

      it('should normalize en-US to en', () => {
        const result = translate('en-US', 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should handle uppercase language codes', () => {
        const result = translate('EN', 'welcome');
        expect(result).toContain('Welcome to PayPing');
      });

      it('should handle mixed case language codes', () => {
        const result = translate('Ru', 'welcome');
        expect(result).toContain('Добро пожаловать');
      });
    });

    describe('caching behavior', () => {
      it('should cache bundles for performance', () => {
        // First call loads from file
        const result1 = translate('en', 'welcome');
        // Second call should use cache (same result)
        const result2 = translate('en', 'welcome');
        expect(result1).toBe(result2);
      });

      it('should maintain separate caches per locale', () => {
        const enResult = translate('en', 'welcome');
        const ruResult = translate('ru', 'welcome');

        expect(enResult).toContain('Welcome');
        expect(ruResult).toContain('Добро пожаловать');
        expect(enResult).not.toBe(ruResult);
      });
    });

    describe('all locale translations', () => {
      // Keys that don't require parameters
      const simpleKeys = [
        'welcome',
        'status-subscribed',
        'status-not-subscribed',
        'subscribe-success',
        'subscribe-already',
        'unsubscribe-success',
        'unsubscribe-not-subscribed',
        'btn-subscribe',
        'btn-unsubscribe',
        'error-generic',
        'error-rate-limit',
      ];

      // Keys that require parameters
      const parameterizedKeys = {
        'analytics-no-history': { currentAmount: '100.00' },
        'analytics-with-history': {
          currentAmount: '100.00',
          expectedAmount: '200.00',
          months: 3,
        },
        notification: {
          amount: '100.00',
          monthTotal: '500.00',
          expectedAmount: '1,000.00',
          time: '12:00',
          hash: '0xabc123',
        },
      };

      for (const locale of SUPPORTED_LOCALES) {
        it(`should translate all simple keys for ${locale} locale`, () => {
          for (const key of simpleKeys) {
            const result = translate(locale, key);
            expect(result).not.toBe(key); // Should not return raw key
            expect(result.length).toBeGreaterThan(0);
          }
        });

        it(`should translate all parameterized keys for ${locale} locale`, () => {
          for (const [key, params] of Object.entries(parameterizedKeys)) {
            const result = translate(locale, key, params);
            expect(result).not.toBe(key); // Should not return raw key
            expect(result.length).toBeGreaterThan(0);
          }
        });
      }
    });
  });

  describe('clearBundleCache', () => {
    it('should clear the cache and force reload', () => {
      // Load bundle
      translate('en', 'welcome');

      // Clear cache
      clearBundleCache();

      // Should reload without error
      const result = translate('en', 'welcome');
      expect(result).toContain('Welcome to PayPing');
    });
  });
});
