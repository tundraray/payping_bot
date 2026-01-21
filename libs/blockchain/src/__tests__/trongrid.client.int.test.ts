// TronGrid Client Integration Tests - Design Doc: blockchain-monitoring-design.md (v1.2)
// Generated: 2026-01-22 | Budget Used: 3/3 integration

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { TronGridApiError, TronGridClient } from '../clients/trongrid.client';
import blockchainConfig from '../config/blockchain.config';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';
import { TransactionType } from '../interfaces/transaction.interface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/**
 * TronGrid Client Integration Tests
 *
 * These tests verify the TronGridClient's ability to communicate with the TronGrid API,
 * transform responses into domain models, and handle various error conditions.
 *
 * Mock Boundaries:
 * - HTTP client (axios) - mocked to simulate TronGrid API responses
 * - ConfigService - real ConfigService with test configuration
 *
 * Real Components:
 * - TronGridClient - system under test
 * - Response transformation logic
 * - BlockchainConfig - real configuration loading
 */
describe('TronGridClient Integration Tests', () => {
  let module: TestingModule;
  let client: TronGridClient;

  beforeEach(async () => {
    // Set test environment variables
    process.env.TRONGRID_BASE_URL = 'https://api.trongrid.io';
    process.env.TRONGRID_API_KEY = 'test-api-key';
    process.env.TRONGRID_TIMEOUT_MS = '10000';
    process.env.BACKOFF_INITIAL_MS = '100';
    process.env.BACKOFF_MAX_MS = '1000';
    process.env.BACKOFF_MULTIPLIER = '2';
    process.env.BACKOFF_JITTER_MS = '50';

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [blockchainConfig],
          isGlobal: true,
        }),
      ],
      providers: [TronGridClient],
    }).compile();

    client = module.get<TronGridClient>(TronGridClient);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await module.close();
    // Clean up environment variables
    delete process.env.TRONGRID_BASE_URL;
    delete process.env.TRONGRID_API_KEY;
    delete process.env.TRONGRID_TIMEOUT_MS;
    delete process.env.BACKOFF_INITIAL_MS;
    delete process.env.BACKOFF_MAX_MS;
    delete process.env.BACKOFF_MULTIPLIER;
    delete process.env.BACKOFF_JITTER_MS;
  });

  // ===========================================================================
  // AC-2.1, AC-2.2: USDT Transaction Detection and Extraction
  // ===========================================================================
  describe('USDT Transaction Detection (AC-2.1, AC-2.2)', () => {
    /**
     * @category core-functionality
     * @complexity high
     * @covers AC-2.1, AC-2.2
     *
     * AC-2.1: "When a new USDT transfer is detected, the system shall extract
     *          transaction hash, from/to addresses, token amount, timestamp, and contract address"
     * AC-2.2: "The system shall use contract_address filter for USDT contract (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)"
     *
     * Verification items:
     * - Transaction hash extracted correctly
     * - From address extracted correctly
     * - To address extracted correctly
     * - Amount preserved as string (6 decimals)
     * - Timestamp preserved as Unix milliseconds
     * - Contract address matches USDT
     * - Only Transfer type transactions are returned
     */
    it('AC-2.1/AC-2.2: extracts USDT transaction fields correctly from TronGrid response', async () => {
      // Arrange: Mock TronGrid API response with USDT TRC20 transaction
      const mockResponse = {
        data: {
          data: [
            {
              transaction_id: 'abc123def456789',
              block_timestamp: 1737460740000,
              from: 'TFromAddress123456789',
              to: 'TToAddress987654321',
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

      // Act: Call fetchUSDTTransactions(address, minTimestamp)
      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      // Assert: Verify all fields are correctly extracted and transformed
      expect(transactions).toHaveLength(1);
      expect(transactions[0]).toMatchObject({
        hash: 'abc123def456789',
        type: TransactionType.USDT,
        fromAddress: 'TFromAddress123456789',
        toAddress: 'TToAddress987654321',
        amount: '1000000',
        timestamp: 1737460740000,
        contractAddress: USDT_CONTRACT_ADDRESS,
      });
      expect(transactions[0].raw).toBeDefined();
    });

    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-2.3, AC-2.4
     *
     * AC-2.3: "The system shall request only confirmed transactions (only_confirmed=true)"
     * AC-2.4: "The system shall filter transactions using min_timestamp parameter to reduce data transfer"
     *
     * Verification items:
     * - Request URL includes only_confirmed=true
     * - Request URL includes min_timestamp parameter
     * - Request URL includes contract_address filter for USDT
     */
    it('AC-2.3/AC-2.4: constructs API request with correct query parameters', async () => {
      // Arrange: Setup mock to capture request parameters
      const mockResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };
      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const walletAddress = 'TTestWallet';
      const minTimestamp = 1737460000000;

      // Act: Call fetchUSDTTransactions(address, minTimestamp)
      await client.fetchUSDTTransactions(walletAddress, minTimestamp);

      // Assert: Verify request includes only_confirmed=true, min_timestamp, contract_address
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

  // ===========================================================================
  // AC-2.5, AC-7.1, AC-7.2: Error Handling with Exponential Backoff
  // ===========================================================================
  describe('Error Handling (AC-2.5, AC-7.1, AC-7.2)', () => {
    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-7.1
     *
     * AC-7.1: "When TronGrid returns HTTP 429, the system shall wait using exponential backoff (initial: 1s, max: 60s)"
     *
     * Verification items:
     * - HTTP 429 response triggers retry behavior
     * - Successful retry returns valid data
     */
    it('AC-7.1: retries with backoff on HTTP 429', async () => {
      // Arrange: Mock API to return HTTP 429 first, then success
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(successResponse);

      // Act: Call fetchUSDTTransactions
      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      // Assert: Request made twice (initial + retry), returns success
      expect(transactions).toEqual([]);
      expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    });

    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-7.2
     *
     * AC-7.2: "When TronGrid returns HTTP 5xx, the system shall retry up to 3 times with backoff"
     *
     * Verification items:
     * - HTTP 5xx triggers retry behavior
     * - Retries up to 3 times before failing
     * - Throws TronGridApiError after all retries exhausted
     */
    it('AC-7.2: retries on HTTP 5xx errors up to 3 times', async () => {
      // Arrange: Mock API to return 500 consistently
      const serverError = { response: { status: 500 } };

      mockedAxios.get
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);

      // Act & Assert: Call fetchUSDTTransactions and expect error
      await expect(client.fetchUSDTTransactions('TTestWallet', 1737460000000)).rejects.toThrow(
        TronGridApiError,
      );

      // Initial + 3 retries = 4 calls
      expect(mockedAxios.get).toHaveBeenCalledTimes(4);
    });

    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-2.5, AC-7.4
     *
     * AC-2.5: "If the API returns an error, then the system shall retry with exponential backoff"
     * AC-7.4: "The system shall include jitter (0-500ms) in backoff calculations to prevent thundering herd"
     *
     * Verification items:
     * - Backoff delay includes jitter
     * - Delay is at least the initial backoff value
     */
    it('AC-2.5/AC-7.4: applies exponential backoff with jitter between retry attempts', async () => {
      // Arrange: Mock API to fail once, then succeed
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(successResponse);

      // Act: Track time and call fetchUSDTTransactions
      const startTime = Date.now();
      await client.fetchUSDTTransactions('TTestWallet', 1737460000000);
      const elapsed = Date.now() - startTime;

      // Assert: Delay is at least initial backoff (100ms) with jitter (0-50ms)
      // So elapsed should be >= 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });
});
