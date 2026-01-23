import type { I18nFlavor } from '@grammyjs/i18n';
import type { Context } from 'grammy';

/**
 * Custom bot context with i18n support.
 * Extends grammY Context with I18nFlavor for localization.
 */
export type BotContext = Context & I18nFlavor;

/**
 * Analytics data for /start command display.
 */
export interface AnalyticsData {
  /** Sum of incoming USDT this month */
  currentMonthSum: string;
  /** Expected amount based on rolling average */
  expectedAmount: string;
  /** Number of months used for average calculation */
  monthsUsed: number;
}

/**
 * Payout statistics for /start command display.
 * All values are approximate based on historical data.
 */
export interface PayoutStats {
  /** Average number of wallets per month (approximate) */
  avgWalletCount: number;
  /** Outgoing payments this month */
  monthlyPayouts: string;
  /** Wallet count this month */
  currentWalletCount: number;
}

/**
 * Callback action constants for inline buttons.
 */
export const CALLBACK_ACTIONS = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  ANALYTICS_PREV: 'analytics:prev',
  ANALYTICS_NEXT: 'analytics:next',
} as const;

export type CallbackAction = (typeof CALLBACK_ACTIONS)[keyof typeof CALLBACK_ACTIONS];

/**
 * Classification types for recipient wallets.
 */
export type Classification = 'UNKNOWN' | 'ONE_TIME' | 'EMPLOYEE' | 'FREELANCER' | 'FIRED';

/**
 * Analytics result for a single recipient wallet.
 */
export interface AnalyticsResult {
  /** Position within classification group */
  position: number;
  /** Recipient wallet address */
  walletAddress: string;
  /** Classification type */
  classification: Classification;
  /** Total amount received in period */
  amount: string;
  /** Previous month position (null if new) */
  previousPosition: number | null;
  /** Position change indicator */
  positionChange: 'up' | 'down' | 'same' | 'new';
}

/**
 * Fired wallet information.
 */
export interface FiredWallet {
  /** Wallet address */
  walletAddress: string;
  /** Last payment month in YYYY-MM format */
  lastPaymentMonth: string;
  /** Number of months without payment */
  monthsWithoutPayment: number;
}

/**
 * Grouped analytics result by classification.
 */
export interface GroupedAnalyticsResult {
  /** Employee wallets */
  employees: AnalyticsResult[];
  /** Freelancer wallets */
  freelancers: AnalyticsResult[];
  /** One-time payment wallets */
  oneTime: AnalyticsResult[];
  /** Unknown classification wallets */
  unknown: AnalyticsResult[];
  /** Fired/terminated wallets */
  fired: FiredWallet[];
  /** Month in YYYY-MM format */
  month: string;
  /** Previous month for comparison in YYYY-MM format */
  previousMonth: string;
}

/**
 * Salary change detection result.
 */
export interface SalaryChangeResult {
  /** Previous salary amount */
  previousAmount: string;
  /** New salary amount */
  newAmount: string;
  /** Percentage change */
  changePercent: number;
  /** Whether the change is confirmed */
  confirmed: boolean;
}
