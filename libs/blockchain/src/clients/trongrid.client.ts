import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosError } from 'axios';
import type { BlockchainConfig } from '../config/blockchain.config';
import type { Transaction } from '../interfaces/transaction.interface';
import { TransactionType } from '../interfaces/transaction.interface';
import type {
  TRC20TransactionResponse,
  TronGridPaginatedResponse,
} from '../interfaces/trongrid-response.interface';

/**
 * Custom error class for TronGrid API errors.
 * Provides context for error tracking (Sentry) and debugging.
 */
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

/**
 * HTTP client for TronGrid API.
 * Handles USDT TRC20 transaction fetching with retry logic and error handling.
 *
 * @responsibility HTTP communication with TronGrid API, response transformation, error handling
 * @layer Infrastructure
 */
@Injectable()
export class TronGridClient {
  private readonly logger = new Logger(TronGridClient.name);
  private readonly config: BlockchainConfig;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<BlockchainConfig>('blockchain');
    if (!config) {
      throw new Error('Blockchain configuration not found');
    }
    this.config = config;
  }

  /**
   * Fetches USDT TRC20 transactions for a wallet address.
   *
   * @param address - TRON wallet address to query
   * @param minTimestamp - Minimum timestamp (Unix milliseconds) for filtering
   * @returns Array of domain Transaction objects
   * @throws TronGridApiError on API errors after retry exhaustion
   *
   * @see AC-2.1 - Extracts transaction hash, from/to addresses, token amount, timestamp, contract address
   * @see AC-2.2 - Uses contract_address filter for USDT contract
   * @see AC-2.3 - Requests only confirmed transactions
   * @see AC-2.4 - Uses min_timestamp parameter
   * @see AC-2.5 - Retries with exponential backoff on errors
   * @see AC-7.1 - HTTP 429 triggers exponential backoff
   * @see AC-7.2 - HTTP 5xx retries up to 3 times
   */
  async fetchUSDTTransactions(address: string, minTimestamp: number): Promise<Transaction[]> {
    const url = `${this.config.trongrid.baseUrl}/v1/accounts/${address}/transactions/trc20`;

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.get<TronGridPaginatedResponse<TRC20TransactionResponse>>(url, {
          params: {
            only_confirmed: true,
            min_timestamp: minTimestamp,
            contract_address: this.config.contracts.usdt,
          },
          headers: {
            'TRON-PRO-API-KEY': this.config.trongrid.apiKey,
          },
          timeout: this.config.trongrid.timeoutMs,
        });

        return this.transformResponse(response.data);
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;

        // Retry on rate limit (429) or server errors (5xx)
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

        // Do not retry on other errors (4xx except 429)
        throw new TronGridApiError(
          'Failed to fetch USDT transactions',
          statusCode,
          url,
          error as Error,
        );
      }
    }

    // All retries exhausted - lastError is guaranteed to be set if we reach here
    throw new TronGridApiError(
      'Max retries exceeded',
      (lastError as AxiosError)?.response?.status,
      url,
      lastError as Error,
    );
  }

  /**
   * Transforms TronGrid API response to domain Transaction array.
   * Filters to include only 'Transfer' type transactions.
   */
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

  /**
   * Transforms a single TRC20 API response to domain Transaction.
   */
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

  /**
   * Calculates exponential backoff delay with jitter.
   *
   * @param attempt - Current retry attempt (0-indexed)
   * @returns Delay in milliseconds
   *
   * @see AC-7.4 - Includes jitter (0-jitterMs) in backoff calculations
   */
  private calculateBackoffDelay(attempt: number): number {
    const baseDelay = this.config.backoff.initialMs * this.config.backoff.multiplier ** attempt;
    const cappedDelay = Math.min(baseDelay, this.config.backoff.maxMs);
    const jitter = Math.random() * this.config.backoff.jitterMs;
    return cappedDelay + jitter;
  }

  /**
   * Sleeps for the specified duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
