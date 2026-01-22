# Task: TronGrid Client Implementation

Metadata:
- Phase: 2 (Infrastructure)
- Dependencies: task-1-2 (transaction.interface.ts, trongrid-response.interface.ts), task-1-3 (blockchain.config.ts)
- Provides: TronGridClient service for API communication
- Size: Medium (2 files: implementation + integration tests)

## Implementation Content
Create the HTTP client for TronGrid API that:
1. Fetches USDT TRC20 transactions for a wallet address
2. Transforms API responses to domain Transaction objects
3. Handles errors with exponential backoff and retry logic
4. Filters by USDT contract address and min_timestamp

Reference: Design Doc "TronGridClient" component section and "Data Contract" section.

## Target Files
- [x] `libs/blockchain/src/clients/trongrid.client.ts` (new)
- [x] `libs/blockchain/src/clients/trongrid.client.spec.ts` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Integration Tests

```typescript
// libs/blockchain/src/clients/trongrid.client.int.test.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { TronGridClient } from './trongrid.client';
import { Transaction, TransactionType } from '../interfaces/transaction.interface';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TronGridClient Integration Tests', () => {
  let client: TronGridClient;
  let configService: ConfigService;

  const mockConfig = {
    trongrid: {
      baseUrl: 'https://api.trongrid.io',
      apiKey: 'test-api-key',
      timeoutMs: 10000,
    },
    backoff: {
      initialMs: 100,
      maxMs: 1000,
      multiplier: 2,
      jitterMs: 50,
    },
    contracts: {
      usdt: USDT_CONTRACT_ADDRESS,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TronGridClient,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'blockchain') return mockConfig;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    client = module.get<TronGridClient>(TronGridClient);
    configService = module.get<ConfigService>(ConfigService);
    jest.clearAllMocks();
  });

  /**
   * @category core-functionality
   * @complexity high
   * @covers AC-2.1, AC-2.2
   */
  describe('AC-2.1/AC-2.2: extracts USDT transaction fields', () => {
    it('should transform TronGrid response to domain Transaction', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              transaction_id: 'abc123def456',
              block_timestamp: 1737460740000,
              from: 'TFromAddress123',
              to: 'TToAddress456',
              value: '1000000', // 1 USDT (6 decimals)
              token_info: {
                symbol: 'USDT',
                address: USDT_CONTRACT_ADDRESS,
                decimals: 6,
                name: 'Tether USD',
              },
              type: 'Transfer',
            },
          ],
          success: true,
          meta: { at: 1737460740000, page_size: 20 },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        hash: 'abc123def456',
        type: TransactionType.USDT,
        fromAddress: 'TFromAddress123',
        toAddress: 'TToAddress456',
        amount: '1000000',
        timestamp: 1737460740000,
        contractAddress: USDT_CONTRACT_ADDRESS,
      });
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-2.3, AC-2.4
   */
  describe('AC-2.3/AC-2.4: constructs API request with correct query parameters', () => {
    it('should include only_confirmed, min_timestamp, and contract_address in request', async () => {
      const mockResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const walletAddress = 'TTestWallet';
      const minTimestamp = 1737460000000;

      await client.fetchUSDTTransactions(walletAddress, minTimestamp);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining(`/v1/accounts/${walletAddress}/transactions/trc20`),
        expect.objectContaining({
          params: expect.objectContaining({
            only_confirmed: true,
            min_timestamp: minTimestamp,
            contract_address: USDT_CONTRACT_ADDRESS,
          }),
          headers: expect.objectContaining({
            'TRON-PRO-API-KEY': 'test-api-key',
          }),
          timeout: 10000,
        }),
      );
    });
  });

  /**
   * @category edge-case
   * @complexity medium
   * @covers AC-7.1, AC-7.2
   */
  describe('AC-7.1/AC-7.2: error handling with backoff', () => {
    it('should retry with backoff on HTTP 429', async () => {
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      expect(transactions).toEqual([]);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    it('should retry up to 3 times on HTTP 5xx', async () => {
      const serverError = { response: { status: 500 } };

      mockedAxios.get
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);

      await expect(client.fetchUSDTTransactions('TTestWallet', 1737460000000))
        .rejects.toThrow();

      // Initial + 3 retries = 4 calls
      expect(mockedAxios.get).toHaveBeenCalledTimes(4);
    });

    it('should include jitter in backoff delay', async () => {
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      const startTime = Date.now();
      await client.fetchUSDTTransactions('TTestWallet', 1737460000000);
      const elapsed = Date.now() - startTime;

      // Initial backoff is 100ms + jitter (0-50ms), so should be at least 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });
});
```

Run tests to confirm they fail:
```bash
pnpm run test libs/blockchain/src/clients/trongrid.client.int.test.ts
```

### 2. Green Phase - Implement TronGridClient

```typescript
// libs/blockchain/src/clients/trongrid.client.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { BlockchainConfig } from '../config/blockchain.config';
import { Transaction, TransactionType } from '../interfaces/transaction.interface';
import {
  TronGridPaginatedResponse,
  TRC20TransactionResponse,
} from '../interfaces/trongrid-response.interface';

export class TronGridApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly url?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'TronGridApiError';
  }
}

@Injectable()
export class TronGridClient {
  private readonly logger = new Logger(TronGridClient.name);
  private readonly config: BlockchainConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.configService.get<BlockchainConfig>('blockchain')!;
  }

  async fetchUSDTTransactions(
    address: string,
    minTimestamp: number,
  ): Promise<Transaction[]> {
    const url = `${this.config.trongrid.baseUrl}/v1/accounts/${address}/transactions/trc20`;

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<TronGridPaginatedResponse<TRC20TransactionResponse>>(
          url,
          {
            params: {
              only_confirmed: true,
              min_timestamp: minTimestamp,
              contract_address: this.config.contracts.usdt,
            },
            headers: {
              'TRON-PRO-API-KEY': this.config.trongrid.apiKey,
            },
            timeout: this.config.trongrid.timeoutMs,
          },
        );

        return this.transformResponse(response.data);
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;

        if (statusCode === 429 || (statusCode && statusCode >= 500)) {
          if (attempt < maxRetries) {
            const delay = this.calculateBackoffDelay(attempt);
            this.logger.warn(
              `TronGrid API error (${statusCode}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
            );
            await this.sleep(delay);
            continue;
          }
        }

        throw new TronGridApiError(
          `Failed to fetch USDT transactions`,
          statusCode,
          url,
          error as Error,
        );
      }
    }

    throw new TronGridApiError(
      'Max retries exceeded',
      undefined,
      url,
      lastError!,
    );
  }

  private transformResponse(
    response: TronGridPaginatedResponse<TRC20TransactionResponse>,
  ): Transaction[] {
    if (!response.success || !response.data) {
      return [];
    }

    return response.data
      .filter((tx) => tx.type === 'Transfer')
      .map((tx) => this.transformTransaction(tx));
  }

  private transformTransaction(tx: TRC20TransactionResponse): Transaction {
    return {
      hash: tx.transaction_id,
      type: TransactionType.USDT,
      fromAddress: tx.from,
      toAddress: tx.to,
      amount: tx.value,
      timestamp: tx.block_timestamp,
      blockNumber: 0, // TRC20 endpoint doesn't return block number directly
      contractAddress: tx.token_info.address,
      raw: tx,
    };
  }

  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.backoff.initialMs * Math.pow(this.config.backoff.multiplier, attempt);
    const cappedDelay = Math.min(baseDelay, this.config.backoff.maxMs);
    const jitter = Math.random() * this.config.backoff.jitterMs;
    return cappedDelay + jitter;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
```

Run tests to confirm they pass:
```bash
pnpm run test libs/blockchain/src/clients/trongrid.client.int.test.ts
```

### 3. Refactor Phase
- Extract retry logic to a separate method if needed
- Add JSDoc comments
- Ensure logging is comprehensive
- Review error message clarity

## Completion Criteria
- [x] TronGridClient service created
- [x] All 13 unit tests pass (comprehensive coverage)
- [x] API request includes required parameters (only_confirmed, min_timestamp, contract_address)
- [x] Error handling with exponential backoff implemented
- [x] Operation verified: L2 (Test Operation) - all tests pass
- [x] `pnpm run check` passes

## Related Acceptance Criteria
- AC-2.1: Extract transaction hash, from/to addresses, token amount, timestamp, and contract address
- AC-2.2: Use contract_address filter for USDT contract
- AC-2.3: Request only confirmed transactions (only_confirmed=true)
- AC-2.4: Use min_timestamp parameter
- AC-2.5: Retry with exponential backoff on errors
- AC-7.1: HTTP 429 triggers exponential backoff
- AC-7.2: HTTP 5xx retries up to 3 times

## Notes
- Impact scope: New files in `libs/blockchain/src/clients/`
- Constraints: Must use axios (already installed)
- The TronGridClient is a pure infrastructure component - no business logic
- TronGridApiError provides context for error tracking (Sentry)
