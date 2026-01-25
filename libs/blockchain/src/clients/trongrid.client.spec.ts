import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import axios from 'axios';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';
import { TransactionType } from '../interfaces/transaction.interface';
import { TronGridApiError, TronGridClient } from './trongrid.client';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('TronGridClient', () => {
  let client: TronGridClient;

  const mockConfig = {
    trongrid: {
      baseUrl: 'https://api.trongrid.io',
      apiKey: 'test-api-key',
      timeoutMs: 10000,
    },
    polling: {
      maxPages: 100,
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
    jest.clearAllMocks();
  });

  // ===========================================================================
  // AC-2.1, AC-2.2: USDT Transaction Detection and Extraction
  // ===========================================================================
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
              value: '1000000',
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

    it('should filter out non-Transfer transactions (like Approval)', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              transaction_id: 'transfer123',
              block_timestamp: 1737460740000,
              from: 'TFromAddress123',
              to: 'TToAddress456',
              value: '1000000',
              token_info: {
                symbol: 'USDT',
                address: USDT_CONTRACT_ADDRESS,
                decimals: 6,
                name: 'Tether USD',
              },
              type: 'Transfer',
            },
            {
              transaction_id: 'approval456',
              block_timestamp: 1737460750000,
              from: 'TFromAddress123',
              to: 'TSpenderAddress789',
              value: '999999999999',
              token_info: {
                symbol: 'USDT',
                address: USDT_CONTRACT_ADDRESS,
                decimals: 6,
                name: 'Tether USD',
              },
              type: 'Approval',
            },
          ],
          success: true,
          meta: { at: 1737460750000, page_size: 20 },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      expect(transactions).toHaveLength(1);
      expect(transactions[0].hash).toBe('transfer123');
    });

    it('should return empty array when response has no data', async () => {
      const mockResponse = {
        data: {
          data: [],
          success: true,
          meta: { at: 1737460740000, page_size: 20 },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      expect(transactions).toEqual([]);
    });

    it('should return empty array when response success is false', async () => {
      const mockResponse = {
        data: {
          data: [],
          success: false,
          meta: { at: 1737460740000, page_size: 20 },
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      expect(transactions).toEqual([]);
    });
  });

  // ===========================================================================
  // AC-2.3, AC-2.4: Constructs API Request with Correct Query Parameters
  // ===========================================================================
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
        `${mockConfig.trongrid.baseUrl}/v1/accounts/${walletAddress}/transactions/trc20`,
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
  // AC-7.1, AC-7.2: Error Handling with Backoff
  // ===========================================================================
  describe('AC-7.1/AC-7.2: error handling with backoff', () => {
    it('should retry with backoff on HTTP 429', async () => {
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(successResponse);

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

      await expect(client.fetchUSDTTransactions('TTestWallet', 1737460000000)).rejects.toThrow(
        TronGridApiError,
      );

      // Initial + 3 retries = 4 calls
      expect(mockedAxios.get).toHaveBeenCalledTimes(4);
    });

    it('should succeed after retry on HTTP 5xx', async () => {
      const serverError = { response: { status: 503 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(successResponse);

      const transactions = await client.fetchUSDTTransactions('TTestWallet', 1737460000000);

      expect(transactions).toEqual([]);
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
    });

    it('should not retry on HTTP 4xx (except 429)', async () => {
      const clientError = { response: { status: 400 } };

      mockedAxios.get.mockRejectedValueOnce(clientError);

      await expect(client.fetchUSDTTransactions('TTestWallet', 1737460000000)).rejects.toThrow(
        TronGridApiError,
      );

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('should throw TronGridApiError with statusCode on failure', async () => {
      const serverError = { response: { status: 500 } };

      mockedAxios.get
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);

      try {
        await client.fetchUSDTTransactions('TTestWallet', 1737460000000);
        fail('Expected TronGridApiError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(TronGridApiError);
        expect((error as TronGridApiError).statusCode).toBe(500);
        expect((error as TronGridApiError).url).toContain('TTestWallet');
      }
    });

    it('should include jitter in backoff delay', async () => {
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: { data: [], success: true, meta: { at: 0, page_size: 20 } },
      };

      mockedAxios.get.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(successResponse);

      const startTime = Date.now();
      await client.fetchUSDTTransactions('TTestWallet', 1737460000000);
      const elapsed = Date.now() - startTime;

      // Initial backoff is 100ms + jitter (0-50ms), so should be at least 100ms
      expect(elapsed).toBeGreaterThanOrEqual(100);
    });
  });

  // ===========================================================================
  // getAccountCreationTimestamp Tests
  // ===========================================================================
  describe('getAccountCreationTimestamp', () => {
    it('should return account creation timestamp on success', async () => {
      const mockResponse = {
        data: {
          data: [
            {
              create_time: 1609459200000, // 2021-01-01 00:00:00 UTC
              address: 'TTestWallet123456789012345678901234',
              balance: 1000000,
            },
          ],
          success: true,
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getAccountCreationTimestamp('TTestWallet');

      expect(result).toBe(1609459200000);
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `${mockConfig.trongrid.baseUrl}/v1/accounts/TTestWallet`,
        expect.objectContaining({
          headers: expect.objectContaining({
            'TRON-PRO-API-KEY': 'test-api-key',
          }),
          timeout: 10000,
        }),
      );
    });

    it('should return null when account not found (empty data)', async () => {
      const mockResponse = {
        data: {
          data: [],
          success: true,
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getAccountCreationTimestamp('TTestWallet');

      expect(result).toBeNull();
    });

    it('should return null when response success is false', async () => {
      const mockResponse = {
        data: {
          data: [],
          success: false,
        },
      };

      mockedAxios.get.mockResolvedValueOnce(mockResponse);

      const result = await client.getAccountCreationTimestamp('TTestWallet');

      expect(result).toBeNull();
    });

    it('should return null on API error without throwing', async () => {
      mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

      const result = await client.getAccountCreationTimestamp('TTestWallet');

      expect(result).toBeNull();
    });

    it('should return null on HTTP error without throwing', async () => {
      const serverError = { response: { status: 500 }, message: 'Server error' };
      mockedAxios.get.mockRejectedValueOnce(serverError);

      const result = await client.getAccountCreationTimestamp('TTestWallet');

      expect(result).toBeNull();
    });
  });

  // ===========================================================================
  // getUSDTBalance Tests (Task 1.4)
  // ===========================================================================
  describe('getUSDTBalance', () => {
    // Use a valid TRON Base58 address for testing
    // TRON addresses use Base58 alphabet: 123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz
    // Note: 0, O, I, l are NOT valid Base58 characters
    const TEST_WALLET_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';

    // -------------------------------------------------------------------------
    // Valid balance response: hex parsing works
    // -------------------------------------------------------------------------
    it('should parse valid balance response correctly', async () => {
      // 5000.00 USDT = 5,000,000,000 raw units (6 decimals)
      // 5000000000 in hex = 0x12a05f200
      // Padded to 64 chars: 0000000000000000000000000000000000000000000000000000012a05f200
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: ['0000000000000000000000000000000000000000000000000000012a05f200'],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('5000000000');
    });

    // -------------------------------------------------------------------------
    // Zero balance: returns "0"
    // -------------------------------------------------------------------------
    it('should return "0" for zero balance', async () => {
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: ['0000000000000000000000000000000000000000000000000000000000000000'],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('0');
    });

    it('should return "0" for empty hex string', async () => {
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: [''],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('0');
    });

    // -------------------------------------------------------------------------
    // Large balance: BigInt handles correctly
    // -------------------------------------------------------------------------
    it('should handle large balances correctly', async () => {
      // 1,000,000,000,000,000 raw units (very large balance)
      // In hex = 0x38d7ea4c68000
      // Padded to 64 chars: 00000000000000000000000000000000000000000000000000038d7ea4c68000
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: ['00000000000000000000000000000000000000000000000000038d7ea4c68000'],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('1000000000000000');
    });

    it('should handle balance with 0x prefix', async () => {
      // 100 USDT = 100,000,000 raw units = 0x5f5e100
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: ['0x0000000000000000000000000000000000000000000000000000000005f5e100'],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('100000000');
    });

    // -------------------------------------------------------------------------
    // API error: throws TronGridApiError
    // -------------------------------------------------------------------------
    it('should throw TronGridApiError on network error', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(TronGridApiError);
    });

    it('should throw TronGridApiError with correct message on network error', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(
        'Failed to fetch USDT balance',
      );
    });

    it('should throw TronGridApiError on HTTP 4xx (except 429)', async () => {
      const clientError = { response: { status: 400 } };

      mockedAxios.post.mockRejectedValueOnce(clientError);

      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(TronGridApiError);
    });

    // -------------------------------------------------------------------------
    // Timeout: throws error
    // -------------------------------------------------------------------------
    it('should throw error on timeout', async () => {
      const timeoutError = new Error('timeout of 10000ms exceeded');
      timeoutError.name = 'AxiosError';

      mockedAxios.post.mockRejectedValueOnce(timeoutError);

      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow();
    });

    // -------------------------------------------------------------------------
    // Invalid response: throws error
    // -------------------------------------------------------------------------
    it('should throw TronGridApiError when constant_result is empty array', async () => {
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: [],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      // parseBalanceResponse throws TronGridApiError which is caught and re-thrown
      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(TronGridApiError);
    });

    it('should throw TronGridApiError when constant_result is undefined', async () => {
      const mockResponse = {
        data: {
          result: { result: true },
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      // parseBalanceResponse throws TronGridApiError which is caught and re-thrown
      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(TronGridApiError);
    });

    it('should throw TronGridApiError when result.result is false', async () => {
      const mockResponse = {
        data: {
          result: { result: false },
          constant_result: ['0000000000000000000000000000000000000000000000000000000000000000'],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      // parseBalanceResponse throws TronGridApiError which is caught and re-thrown
      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(TronGridApiError);
    });

    // -------------------------------------------------------------------------
    // Retry logic: retries on 429 and 5xx
    // -------------------------------------------------------------------------
    it('should retry with backoff on HTTP 429', async () => {
      const rateLimitError = { response: { status: 429 } };
      const successResponse = {
        data: {
          result: { result: true },
          constant_result: ['0000000000000000000000000000000000000000000000000000000005f5e100'],
        },
      };

      mockedAxios.post.mockRejectedValueOnce(rateLimitError).mockResolvedValueOnce(successResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('100000000');
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should retry up to 3 times on HTTP 5xx', async () => {
      const serverError = { response: { status: 500 } };

      mockedAxios.post
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);

      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(TronGridApiError);

      // Initial + 3 retries = 4 calls
      expect(mockedAxios.post).toHaveBeenCalledTimes(4);
    });

    it('should succeed after retry on HTTP 5xx', async () => {
      const serverError = { response: { status: 503 } };
      const successResponse = {
        data: {
          result: { result: true },
          constant_result: ['0000000000000000000000000000000000000000000000000000000005f5e100'],
        },
      };

      mockedAxios.post
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockResolvedValueOnce(successResponse);

      const balance = await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(balance).toBe('100000000');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should throw TronGridApiError when all retries fail on HTTP 5xx', async () => {
      const serverError = { response: { status: 500 } };

      mockedAxios.post
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError)
        .mockRejectedValueOnce(serverError);

      // After exhausting retries, the final attempt fails and throws from catch block
      await expect(client.getUSDTBalance(TEST_WALLET_ADDRESS)).rejects.toThrow(
        'Failed to fetch USDT balance',
      );
    });

    // -------------------------------------------------------------------------
    // Address encoding: parameter is hex string
    // -------------------------------------------------------------------------
    it('should correctly encode address parameter in request', async () => {
      const mockResponse = {
        data: {
          result: { result: true },
          constant_result: ['0000000000000000000000000000000000000000000000000000000000000000'],
        },
      };

      mockedAxios.post.mockResolvedValueOnce(mockResponse);

      await client.getUSDTBalance(TEST_WALLET_ADDRESS);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        `${mockConfig.trongrid.baseUrl}/wallet/triggerconstantcontract`,
        expect.objectContaining({
          contract_address: USDT_CONTRACT_ADDRESS,
          function_selector: 'balanceOf(address)',
          parameter: expect.stringMatching(/^[0-9a-f]{64}$/), // 64 hex chars (32 bytes)
          owner_address: TEST_WALLET_ADDRESS,
          visible: true,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'TRON-PRO-API-KEY': 'test-api-key',
            'Content-Type': 'application/json',
          }),
          timeout: 10000,
        }),
      );
    });

    it('should throw error for invalid address characters', async () => {
      // Characters like !, @, # are not valid in Base58
      await expect(client.getUSDTBalance('TXY!@#invalid')).rejects.toThrow(TronGridApiError);
    });

    it('should throw error for address containing invalid Base58 character 0', async () => {
      // 0 is not a valid Base58 character
      await expect(client.getUSDTBalance('T0000000000000000000000000000000000')).rejects.toThrow(
        'Invalid character in address: 0',
      );
    });
  });

  // ===========================================================================
  // TronGridApiError Tests
  // ===========================================================================
  describe('TronGridApiError', () => {
    it('should create error with all properties', () => {
      const cause = new Error('Original error');
      const error = new TronGridApiError('Test message', 500, '/test/url', cause);

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(500);
      expect(error.url).toBe('/test/url');
      expect(error.cause).toBe(cause);
      expect(error.name).toBe('TronGridApiError');
    });

    it('should work without optional parameters', () => {
      const error = new TronGridApiError('Test message');

      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBeUndefined();
      expect(error.url).toBeUndefined();
      expect(error.cause).toBeUndefined();
    });
  });
});
