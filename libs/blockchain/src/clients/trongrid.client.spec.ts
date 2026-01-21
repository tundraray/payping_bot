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
