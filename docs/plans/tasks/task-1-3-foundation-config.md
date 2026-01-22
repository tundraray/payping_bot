# Task: Foundation Configuration

Metadata:
- Phase: 1 (Foundation)
- Dependencies: task-1-2 (uses TransactionType from interfaces)
- Provides: BlockchainConfig interface and registerAs configuration
- Size: Small (1 implementation file + 1 test file)

## Implementation Content
Create the configuration registration for blockchain settings using NestJS ConfigModule. The configuration schema is defined in the Design Doc "Configuration Schema" section.

## Target Files
- [x] `libs/blockchain/src/config/blockchain.config.ts` (new)
- [x] `libs/blockchain/src/config/blockchain.config.spec.ts` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests

```typescript
// libs/blockchain/src/config/blockchain.config.spec.ts

import blockchainConfig, { BlockchainConfig } from './blockchain.config';

describe('blockchainConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
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
      expect(config.polling.fallbackWindowMs).toBe(60000);
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

      const config = blockchainConfig() as BlockchainConfig;

      expect(config.polling.intervalMs).toBe(3000);
      expect(config.polling.enabled).toBe(false);
      expect(config.polling.fallbackWindowMs).toBe(120000);
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
});
```

Run tests to confirm they fail:
```bash
pnpm run test libs/blockchain/src/config/blockchain.config.spec.ts
```

### 2. Green Phase - Implement Configuration

```typescript
// libs/blockchain/src/config/blockchain.config.ts

import { registerAs } from '@nestjs/config';

export interface BlockchainConfig {
  trongrid: {
    baseUrl: string;
    apiKey: string;
    timeoutMs: number;
  };
  polling: {
    intervalMs: number;
    enabled: boolean;
    fallbackWindowMs: number;
  };
  lruCache: {
    maxSize: number;
    ttlMs: number;
  };
  backoff: {
    initialMs: number;
    maxMs: number;
    multiplier: number;
    jitterMs: number;
  };
  contracts: {
    usdt: string;
  };
}

export default registerAs('blockchain', (): BlockchainConfig => ({
  trongrid: {
    baseUrl: process.env.TRONGRID_BASE_URL || 'https://api.trongrid.io',
    apiKey: process.env.TRONGRID_API_KEY || '',
    timeoutMs: parseInt(process.env.TRONGRID_TIMEOUT_MS || '10000', 10),
  },
  polling: {
    intervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '5000', 10),
    enabled: process.env.POLLING_ENABLED !== 'false',
    fallbackWindowMs: parseInt(process.env.POLLING_FALLBACK_WINDOW_MS || '60000', 10),
  },
  lruCache: {
    maxSize: parseInt(process.env.LRU_CACHE_SIZE || '10000', 10),
    ttlMs: parseInt(process.env.LRU_CACHE_TTL_MS || '3600000', 10),
  },
  backoff: {
    initialMs: parseInt(process.env.BACKOFF_INITIAL_MS || '1000', 10),
    maxMs: parseInt(process.env.BACKOFF_MAX_MS || '60000', 10),
    multiplier: parseFloat(process.env.BACKOFF_MULTIPLIER || '2'),
    jitterMs: parseInt(process.env.BACKOFF_JITTER_MS || '500', 10),
  },
  contracts: {
    usdt: process.env.USDT_CONTRACT_ADDRESS || 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
  },
}));
```

Run tests to confirm they pass:
```bash
pnpm run test libs/blockchain/src/config/blockchain.config.spec.ts
```

### 3. Refactor Phase
- Review for any code duplication
- Ensure JSDoc comments are complete
- Verify all environment variables match Design Doc

## Completion Criteria
- [x] Configuration file created with all settings
- [x] All unit tests pass
- [x] Configuration matches Design Doc "Configuration Schema" section
- [x] Operation verified: L2 (Test Operation) - all config tests pass
- [x] `pnpm run check` passes

## Related Acceptance Criteria
- AC-9.1: The system shall read configuration from environment variables
- AC-9.2: Required configuration: `TRONGRID_API_KEY`, `TRONGRID_BASE_URL`
- AC-9.3: Optional configuration with defaults: `POLLING_INTERVAL_MS=5000`, `LRU_CACHE_SIZE=10000`, `BACKOFF_INITIAL_MS=1000`, `BACKOFF_MAX_MS=60000`

## Notes
- Impact scope: New files only in `libs/blockchain/src/config/`
- Constraints: Configuration keys must match Design Doc exactly
- The `registerAs('blockchain', ...)` creates a namespaced configuration accessed via `configService.get<BlockchainConfig>('blockchain')`
