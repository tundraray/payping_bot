/**
 * Generic paginated response wrapper from TronGrid API
 * @template T The type of items in the data array
 */
export interface TronGridPaginatedResponse<T> {
  /** Array of response items */
  data: T[];
  /** Whether the request was successful */
  success: boolean;
  /** Metadata about the response */
  meta: {
    /** Timestamp of the response */
    at: number;
    /** Number of items per page */
    page_size: number;
    /** Pagination fingerprint for fetching next page */
    fingerprint?: string;
  };
}

/**
 * Account info response from TronGrid API
 * Returned by GET /v1/accounts/{address}
 */
export interface TronGridAccountResponse {
  /** Array containing account data (usually single element) */
  data: Array<{
    /** Account creation timestamp in milliseconds */
    create_time: number;
    /** Account address in base58 format */
    address: string;
    /** Account balance in SUN (1 TRX = 1,000,000 SUN) */
    balance?: number;
  }>;
  /** Whether the request was successful */
  success: boolean;
}

/**
 * TRC20 transaction response from TronGrid API
 * Represents a single TRC20 token transfer
 */
export interface TRC20TransactionResponse {
  /** Transaction hash/ID */
  transaction_id: string;
  /** Block timestamp in milliseconds */
  block_timestamp: number;
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Transfer amount in smallest unit (for USDT: 6 decimals) */
  value: string;
  /** Information about the token */
  token_info: {
    /** Token symbol (e.g., 'USDT') */
    symbol: string;
    /** Token contract address */
    address: string;
    /** Token decimals (6 for USDT) */
    decimals: number;
    /** Token name (e.g., 'Tether USD') */
    name: string;
  };
  /** Transaction type ('Transfer' or 'Approval') */
  type: string;
}
