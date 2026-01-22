import blockchainConfig, { type BlockchainConfig } from './blockchain.config';

describe('blockchainConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear all blockchain-related env vars to test defaults
    delete process.env.TRONGRID_BASE_URL;
    delete process.env.TRONGRID_API_KEY;
    delete process.env.TRONGRID_TIMEOUT_MS;
    delete process.env.POLLING_INTERVAL_MS;
    delete process.env.POLLING_ENABLED;
    delete process.env.POLLING_FALLBACK_WINDOW_MS;
    delete process.env.POLLING_MAX_PAGES;
    delete process.env.LRU_CACHE_SIZE;
    delete process.env.LRU_CACHE_TTL_MS;
    delete process.env.BACKOFF_INITIAL_MS;
    delete process.env.BACKOFF_MAX_MS;
    delete process.env.BACKOFF_MULTIPLIER;
    delete process.env.BACKOFF_JITTER_MS;
    delete process.env.USDT_CONTRACT_ADDRESS;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('default values', () => {
    it('should return default trongrid configuration', () => {
      const config = blockchainConfig() as BlockchainConfig;

      expect(config.trongrid.baseUrl).toBe('https://api.trongrid.io');
      expect(config.trongrid.apiKey).toBe('');
      expect(config.trongrid.timeoutMs).toBe(10000);
    });

    it('should return default polling configuration', () => {
      const config = blockchainConfig() as BlockchainConfig;

      expect(config.polling.intervalMs).toBe(5000);
      expect(config.polling.enabled).toBe(true);
      expect(config.polling.fallbackWindowMs).toBe(63072000000); // 2 years in ms
      expect(config.polling.maxPages).toBe(100);
    });

    it('should return default lruCache configuration', () => {
      const config = blockchainConfig() as BlockchainConfig;

      expect(config.lruCache.maxSize).toBe(10000);
      expect(config.lruCache.ttlMs).toBe(3600000);
    });

    it('should return default backoff configuration', () => {
      const config = blockchainConfig() as BlockchainConfig;

      expect(config.backoff.initialMs).toBe(1000);
      expect(config.backoff.maxMs).toBe(60000);
      expect(config.backoff.multiplier).toBe(2);
      expect(config.backoff.jitterMs).toBe(500);
    });

    it('should return default contracts configuration', () => {
      const config = blockchainConfig() as BlockchainConfig;

      expect(config.contracts.usdt).toBe('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t');
    });
  });

  describe('environment variable overrides', () => {
    it('should override trongrid settings from environment', () => {
      process.env.TRONGRID_BASE_URL = 'https://custom.trongrid.io';
      process.env.TRONGRID_API_KEY = 'test-api-key';
      process.env.TRONGRID_TIMEOUT_MS = '5000';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.trongrid.baseUrl).toBe('https://custom.trongrid.io');
      expect(config.trongrid.apiKey).toBe('test-api-key');
      expect(config.trongrid.timeoutMs).toBe(5000);
    });

    it('should override polling settings from environment', () => {
      process.env.POLLING_INTERVAL_MS = '3000';
      process.env.POLLING_ENABLED = 'false';
      process.env.POLLING_FALLBACK_WINDOW_MS = '120000';
      process.env.POLLING_MAX_PAGES = '50';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.polling.intervalMs).toBe(3000);
      expect(config.polling.enabled).toBe(false);
      expect(config.polling.fallbackWindowMs).toBe(120000);
      expect(config.polling.maxPages).toBe(50);
    });

    it('should override lruCache settings from environment', () => {
      process.env.LRU_CACHE_SIZE = '5000';
      process.env.LRU_CACHE_TTL_MS = '1800000';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.lruCache.maxSize).toBe(5000);
      expect(config.lruCache.ttlMs).toBe(1800000);
    });

    it('should override backoff settings from environment', () => {
      process.env.BACKOFF_INITIAL_MS = '2000';
      process.env.BACKOFF_MAX_MS = '120000';
      process.env.BACKOFF_MULTIPLIER = '3';
      process.env.BACKOFF_JITTER_MS = '1000';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.backoff.initialMs).toBe(2000);
      expect(config.backoff.maxMs).toBe(120000);
      expect(config.backoff.multiplier).toBe(3);
      expect(config.backoff.jitterMs).toBe(1000);
    });

    it('should override USDT contract address from environment', () => {
      process.env.USDT_CONTRACT_ADDRESS = 'TCustomContractAddress';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.contracts.usdt).toBe('TCustomContractAddress');
    });
  });

  describe('edge cases', () => {
    it('should handle polling enabled with various truthy values', () => {
      // Default is true (when env var not set)
      let config = blockchainConfig() as BlockchainConfig;
      expect(config.polling.enabled).toBe(true);

      // Only 'false' string should disable polling
      process.env.POLLING_ENABLED = 'true';
      config = blockchainConfig() as BlockchainConfig;
      expect(config.polling.enabled).toBe(true);

      process.env.POLLING_ENABLED = '1';
      config = blockchainConfig() as BlockchainConfig;
      expect(config.polling.enabled).toBe(true);
    });

    it('should parse numeric values correctly', () => {
      process.env.TRONGRID_TIMEOUT_MS = '0';
      process.env.POLLING_INTERVAL_MS = '0';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.trongrid.timeoutMs).toBe(0);
      expect(config.polling.intervalMs).toBe(0);
    });

    it('should handle floating point multiplier', () => {
      process.env.BACKOFF_MULTIPLIER = '1.5';

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.backoff.multiplier).toBe(1.5);
    });
  });
});
