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
 * Callback action constants for inline buttons.
 */
export const CALLBACK_ACTIONS = {
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
} as const;

export type CallbackAction = (typeof CALLBACK_ACTIONS)[keyof typeof CALLBACK_ACTIONS];
