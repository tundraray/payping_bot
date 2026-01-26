import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosError } from 'axios';
import type { BlockchainConfig } from '../config/blockchain.config';
import type { Transaction } from '../interfaces/transaction.interface';
import { TransactionType } from '../interfaces/transaction.interface';
import type {
  TRC20TransactionResponse,
  TronGridAccountResponse,
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
   * Fetches USDT TRC20 transactions for a wallet address with pagination support.
   * Fetches all pages until no more data available, sorted by timestamp ascending (oldest first).
   *
   * @param address - TRON wallet address to query
   * @param minTimestamp - Minimum timestamp (Unix milliseconds) for filtering
   * @returns Array of domain Transaction objects (sorted oldest first)
   * @throws TronGridApiError on API errors after retry exhaustion
   *
   * @see AC-2.1 - Extracts transaction hash, from/to addresses, token amount, timestamp, contract address
   * @see AC-2.2 - Uses contract_address filter for USDT contract
   * @see AC-2.3 - Requests only confirmed transactions
   * @see AC-2.4 - Uses min_timestamp parameter
   * @see AC-2.5 - Retries with exponential backoff on errors
   * @see AC-2.6 - Supports pagination using fingerprint parameter
   * @see AC-2.7 - Fetches all pages until no fingerprint returned
   * @see AC-2.8 - Requests transactions sorted by block_timestamp,asc
   * @see AC-2.9 - Limits pagination to maxPages to prevent infinite loops
   * @see AC-7.1 - HTTP 429 triggers exponential backoff
   * @see AC-7.2 - HTTP 5xx retries up to 3 times
   */
  async fetchUSDTTransactions(address: string, minTimestamp: number): Promise<Transaction[]> {
    const url = `${this.config.trongrid.baseUrl}/v1/accounts/${address}/transactions/trc20`;
    const allTransactions: Transaction[] = [];
    let fingerprint: string | undefined;
    let pageCount = 0;
    const maxPages = this.config.polling.maxPages;

    do {
      const response = await this.fetchPage(url, minTimestamp, fingerprint);
      const transactions = this.transformResponse(response);
      allTransactions.push(...transactions);

      fingerprint = response.meta?.fingerprint;
      pageCount++;

      if (fingerprint) {
        this.logger.debug(
          `Fetched page ${pageCount}, got ${transactions.length} transactions, has more pages`,
        );
      }

      // Safety limit to prevent infinite loops (AC-2.9)
      if (pageCount >= maxPages) {
        this.logger.warn(`Reached max pages limit (${maxPages}), stopping pagination`);
        break;
      }
    } while (fingerprint);

    return allTransactions;
  }

  /**
   * Fetches a single page of transactions with retry logic.
   */
  private async fetchPage(
    url: string,
    minTimestamp: number,
    fingerprint?: string,
  ): Promise<TronGridPaginatedResponse<TRC20TransactionResponse>> {
    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const params: Record<string, unknown> = {
          only_confirmed: true,
          min_timestamp: minTimestamp,
          contract_address: this.config.contracts.usdt,
          order_by: 'block_timestamp,asc',
          limit: 200,
        };

        if (fingerprint) {
          params.fingerprint = fingerprint;
        }

        const response = await axios.get<TronGridPaginatedResponse<TRC20TransactionResponse>>(url, {
          params,
          headers: {
            'TRON-PRO-API-KEY': this.config.trongrid.apiKey,
          },
          timeout: this.config.trongrid.timeoutMs,
        });

        return response.data;
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
   * Fetches account creation timestamp from TronGrid API.
   *
   * @param address - TRON wallet address to query
   * @returns Account creation timestamp in milliseconds, or null if not found/error
   */
  async getAccountCreationTimestamp(address: string): Promise<number | null> {
    const url = `${this.config.trongrid.baseUrl}/v1/accounts/${address}`;

    try {
      const response = await axios.get<TronGridAccountResponse>(url, {
        headers: {
          'TRON-PRO-API-KEY': this.config.trongrid.apiKey,
        },
        timeout: this.config.trongrid.timeoutMs,
      });

      if (response.data.success && response.data.data.length > 0) {
        const createTime = response.data.data[0].create_time;
        this.logger.log(
          `Account creation timestamp for ${address}: ${new Date(createTime).toISOString()}`,
        );
        return createTime;
      }

      this.logger.warn(`No account data found for ${address}`);
      return null;
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.warn(`Failed to fetch account creation timestamp: ${axiosError.message}`);
      return null;
    }
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

  /**
   * Get USDT balance for a wallet address.
   *
   * Uses TronGrid triggerconstantcontract API to call USDT contract's balanceOf function.
   *
   * @param address - TRON wallet address (34 chars, starts with T)
   * @returns USDT balance in raw units (6 decimals, as string)
   * @throws {TronGridApiError} If API call fails or returns invalid response
   *
   * @example
   * const balance = await client.getUSDTBalance('TXyz...');
   * // Returns "5000000000" (5000.00 USDT)
   */
  async getUSDTBalance(address: string): Promise<string> {
    const url = `${this.config.trongrid.baseUrl}/wallet/triggerconstantcontract`;
    const usdtContract = this.config.contracts.usdt;

    const payload = {
      contract_address: usdtContract,
      function_selector: 'balanceOf(address)',
      parameter: this.encodeAddressParameter(address),
      owner_address: address,
      visible: true,
    };

    let lastError: Error | null = null;
    const maxRetries = 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(url, payload, {
          headers: {
            'TRON-PRO-API-KEY': this.config.trongrid.apiKey,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout for balance queries
        });

        return this.parseBalanceResponse(response.data);
      } catch (error) {
        lastError = error as Error;
        const axiosError = error as AxiosError;
        const statusCode = axiosError.response?.status;

        // Retry on rate limit (429) or server errors (5xx)
        if (statusCode === 429 || (statusCode && statusCode >= 500)) {
          if (attempt < maxRetries) {
            const delay = this.calculateBackoffDelay(attempt);
            this.logger.warn(
              `TronGrid balance API error (${statusCode}), retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`,
            );
            await this.sleep(delay);
            continue;
          }
        }

        // Do not retry on other errors (4xx except 429)
        throw new TronGridApiError('Failed to fetch USDT balance', statusCode, url, error as Error);
      }
    }

    // All retries exhausted
    throw new TronGridApiError(
      'Max retries exceeded for balance query',
      (lastError as AxiosError)?.response?.status,
      url,
      lastError as Error,
    );
  }

  /**
   * Encode TRON address as 32-byte hex parameter for smart contract call.
   *
   * TRON addresses are Base58Check encoded with a 0x41 prefix.
   * For balanceOf(address) parameter, we need:
   * 1. Decode Base58Check to get raw bytes
   * 2. Remove the 0x41 prefix (1 byte)
   * 3. Remove the 4-byte checksum
   * 4. Pad the remaining 20-byte address to 32 bytes (64 hex chars)
   *
   * @param address - Base58-encoded TRON address (starts with T)
   * @returns 64-character hex string (32 bytes, left-padded with zeros)
   */
  private encodeAddressParameter(address: string): string {
    // Decode Base58Check address to hex (without 41 prefix and checksum)
    const addressHex = this.decodeBase58Address(address);
    // Pad to 32 bytes (64 hex characters) with leading zeros
    return addressHex.padStart(64, '0');
  }

  /**
   * Decode TRON Base58Check address to 20-byte hex string.
   *
   * TRON address format:
   * - Base58Check encoded
   * - First byte: 0x41 (network identifier for mainnet)
   * - Next 20 bytes: address
   * - Last 4 bytes: checksum (double SHA256)
   *
   * @param address - TRON Base58Check address (34 characters, starts with T)
   * @returns 40-character hex string (20 bytes address without prefix/checksum)
   */
  private decodeBase58Address(address: string): string {
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const ALPHABET_MAP: Record<string, number> = {};
    for (let i = 0; i < ALPHABET.length; i++) {
      ALPHABET_MAP[ALPHABET[i]] = i;
    }

    // Decode Base58 to bytes
    let num = BigInt(0);
    for (const char of address) {
      const value = ALPHABET_MAP[char];
      if (value === undefined) {
        throw new TronGridApiError(`Invalid character in address: ${char}`);
      }
      num = num * BigInt(58) + BigInt(value);
    }

    // Convert BigInt to hex string
    let hex = num.toString(16);

    // Ensure even length
    if (hex.length % 2 !== 0) {
      hex = `0${hex}`;
    }

    // Handle leading zeros in Base58 (each leading '1' = one 0x00 byte)
    let leadingZeros = 0;
    for (const char of address) {
      if (char === '1') {
        leadingZeros++;
      } else {
        break;
      }
    }
    hex = '00'.repeat(leadingZeros) + hex;

    // Full decoded data: 1 byte prefix (41) + 20 bytes address + 4 bytes checksum = 25 bytes = 50 hex chars
    // We want the 20-byte address (40 hex chars), which is after the prefix and before checksum
    // Skip first 2 chars (41 prefix), take next 40 chars (20 bytes address)
    if (hex.length < 50) {
      throw new TronGridApiError(
        `Invalid address encoding: decoded hex too short (${hex.length} chars)`,
      );
    }

    // Extract 20-byte address (skip 41 prefix, ignore 4-byte checksum)
    return hex.slice(2, 42);
  }

  /**
   * Parse USDT balance from TronGrid triggerconstantcontract response.
   *
   * @param data - Response data from triggerconstantcontract
   * @returns Balance as string (raw units, 6 decimals)
   * @throws {TronGridApiError} If response is invalid or indicates failure
   */
  private parseBalanceResponse(data: {
    result?: { result?: boolean };
    constant_result?: string[];
  }): string {
    // Check for API-level errors
    if (data.result && data.result.result === false) {
      throw new TronGridApiError('Balance query returned error result');
    }

    if (!data.constant_result || data.constant_result.length === 0) {
      throw new TronGridApiError('Invalid balance response: missing constant_result');
    }

    const hexBalance = data.constant_result[0];

    // Handle empty or zero result
    if (!hexBalance || hexBalance === '' || /^0+$/.test(hexBalance)) {
      return '0';
    }

    // Remove '0x' prefix if present
    const cleanHex = hexBalance.startsWith('0x') ? hexBalance.slice(2) : hexBalance;

    // Convert hex to BigInt then to decimal string for precision
    try {
      const balance = BigInt(`0x${cleanHex}`).toString();
      return balance;
    } catch {
      throw new TronGridApiError(`Invalid balance hex value: ${hexBalance}`);
    }
  }
}
