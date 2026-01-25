import { registerAs } from '@nestjs/config';

/**
 * Payout session configuration interface.
 * Defines settings for payout session detection and monitoring.
 */
export interface PayoutConfig {
  /** Balance threshold in USDT (default: 1000) - session ends when balance drops below this */
  balanceThresholdUsdt: number;
  /** Timeout in minutes (default: 30) - session ends after this duration of inactivity WITH balance decrease */
  timeoutMinutes: number;
  /** Inactivity timeout in minutes (default: 60) - session ends after this duration regardless of balance change */
  inactivityTimeoutMinutes: number;
  /** Check interval in milliseconds (default: 60000) - how often to check timeout and balance */
  checkIntervalMs: number;
}

/**
 * Blockchain configuration interface.
 * Defines all settings required for TronGrid API integration,
 * polling behavior, caching, error handling, and smart contracts.
 */
export interface BlockchainConfig {
  /** TronGrid API settings */
  trongrid: {
    /** TronGrid API base URL */
    baseUrl: string;
    /** TronGrid API key (required for higher rate limits) */
    apiKey: string;
    /** Request timeout in milliseconds */
    timeoutMs: number;
  };
  /** Polling behavior settings */
  polling: {
    /** Interval between polling cycles in milliseconds */
    intervalMs: number;
    /** Enable/disable polling */
    enabled: boolean;
    /** Fallback lookback window when no DB data AND no wallet creation date (milliseconds, default: 2 years) */
    fallbackWindowMs: number;
    /** Maximum pages to fetch per poll cycle to prevent infinite loops (default: 100) */
    maxPages: number;
  };
  /** LRU cache settings for transaction deduplication */
  lruCache: {
    /** Maximum number of entries in the cache */
    maxSize: number;
    /** Time-to-live for cache entries in milliseconds */
    ttlMs: number;
  };
  /** Exponential backoff settings for error handling */
  backoff: {
    /** Initial backoff delay in milliseconds */
    initialMs: number;
    /** Maximum backoff delay in milliseconds */
    maxMs: number;
    /** Backoff multiplier for exponential growth */
    multiplier: number;
    /** Random jitter range in milliseconds to prevent thundering herd */
    jitterMs: number;
  };
  /** Smart contract addresses */
  contracts: {
    /** USDT TRC20 contract address on TRON mainnet */
    usdt: string;
  };
  /** Payout session configuration */
  payout: PayoutConfig;
}

/**
 * Blockchain configuration factory registered with NestJS ConfigModule.
 * Access via: configService.get<BlockchainConfig>('blockchain')
 *
 * Environment Variables:
 * - TRONGRID_BASE_URL: TronGrid API endpoint (default: https://api.trongrid.io)
 * - TRONGRID_API_KEY: API key for higher rate limits (default: '')
 * - TRONGRID_TIMEOUT_MS: Request timeout (default: 10000)
 * - POLLING_INTERVAL_MS: Polling interval (default: 5000)
 * - POLLING_ENABLED: Enable polling (default: true)
 * - POLLING_FALLBACK_WINDOW_MS: Fallback lookback window (default: 63072000000 = 2 years)
 * - POLLING_MAX_PAGES: Max pages per poll cycle (default: 100)
 * - LRU_CACHE_SIZE: Max cache entries (default: 10000)
 * - LRU_CACHE_TTL_MS: Cache entry TTL (default: 3600000)
 * - BACKOFF_INITIAL_MS: Initial backoff (default: 1000)
 * - BACKOFF_MAX_MS: Max backoff (default: 60000)
 * - BACKOFF_MULTIPLIER: Backoff multiplier (default: 2)
 * - BACKOFF_JITTER_MS: Jitter range (default: 500)
 * - USDT_CONTRACT_ADDRESS: USDT contract (default: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
 * - PAYOUT_BALANCE_THRESHOLD_USDT: Balance threshold for session end (default: 1000)
 * - PAYOUT_TIMEOUT_MINUTES: Timeout with balance decrease for session end (default: 30)
 * - PAYOUT_INACTIVITY_TIMEOUT_MINUTES: Inactivity timeout regardless of balance (default: 60)
 * - PAYOUT_CHECK_INTERVAL_MS: Check interval for timeout/balance (default: 60000)
 */
export default registerAs(
  'blockchain',
  (): BlockchainConfig => ({
    trongrid: {
      baseUrl: process.env.TRONGRID_BASE_URL || 'https://api.trongrid.io',
      apiKey: process.env.TRONGRID_API_KEY || '',
      timeoutMs: parseInt(process.env.TRONGRID_TIMEOUT_MS || '10000', 10),
    },
    polling: {
      intervalMs: parseInt(process.env.POLLING_INTERVAL_MS || '5000', 10),
      enabled: process.env.POLLING_ENABLED !== 'false',
      fallbackWindowMs: parseInt(process.env.POLLING_FALLBACK_WINDOW_MS || '63072000000', 10),
      maxPages: parseInt(process.env.POLLING_MAX_PAGES || '100', 10),
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
    payout: {
      balanceThresholdUsdt: parseInt(process.env.PAYOUT_BALANCE_THRESHOLD_USDT || '1000', 10),
      timeoutMinutes: parseInt(process.env.PAYOUT_TIMEOUT_MINUTES || '30', 10),
      inactivityTimeoutMinutes: parseInt(process.env.PAYOUT_INACTIVITY_TIMEOUT_MINUTES || '60', 10),
      checkIntervalMs: parseInt(process.env.PAYOUT_CHECK_INTERVAL_MS || '60000', 10),
    },
  }),
);
