import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AnalyticsService } from './analytics.service';

/**
 * AnalyticsSchedulerService handles scheduled analytics recalculation.
 *
 * This service:
 * - Runs backfill on application startup to ensure classifications are current
 * - Runs daily at 00:00 UTC to recalculate all classifications
 *
 * This ensures that wallet classifications are always up-to-date,
 * especially after the regularity calculation fix.
 *
 * Graceful shutdown: Uses AbortController to cancel in-progress backfill
 * operations when the application shuts down, preventing CONNECTION_ENDED errors.
 */
@Injectable()
export class AnalyticsSchedulerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsSchedulerService.name);

  /** AbortController for cancelling in-progress backfill operations */
  private abortController: AbortController | null = null;

  /** Promise tracking the current backfill operation */
  private currentBackfillPromise: Promise<number> | null = null;

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Run backfill on application startup.
   * This ensures classifications are recalculated with the correct algorithm.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Application bootstrap: starting analytics backfill...');
    await this.runBackfillWithAbort('Bootstrap');
  }

  /**
   * Daily cron job at 00:00 UTC to recalculate all classifications.
   * This ensures classifications stay accurate over time.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'analytics-backfill',
    timeZone: 'UTC',
  })
  async handleDailyBackfill(): Promise<void> {
    this.logger.log('Daily cron: starting analytics backfill...');
    await this.runBackfillWithAbort('Daily');
  }

  /**
   * Run backfill with abort signal support.
   * Creates an AbortController and tracks the promise for graceful shutdown.
   */
  private async runBackfillWithAbort(source: string): Promise<void> {
    // If already running, skip
    if (this.currentBackfillPromise) {
      this.logger.warn(`${source} backfill skipped: another backfill is in progress`);
      return;
    }

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    this.currentBackfillPromise = this.analyticsService.backfillAnalytics(signal);

    try {
      const processed = await this.currentBackfillPromise;
      if (signal.aborted) {
        this.logger.log(`${source} backfill was cancelled during shutdown`);
      } else {
        this.logger.log(`${source} backfill completed: ${processed} transactions processed`);
      }
    } catch (error) {
      if (signal.aborted) {
        this.logger.log(`${source} backfill cancelled due to shutdown`);
      } else {
        this.logger.error(`${source} backfill failed`, { error });
      }
    } finally {
      this.currentBackfillPromise = null;
      this.abortController = null;
    }
  }

  /**
   * Graceful shutdown: cancel any in-progress backfill and wait for it to stop.
   * This prevents CONNECTION_ENDED errors by ensuring backfill stops
   * before the database connection is closed.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.abortController) {
      this.logger.log('Shutdown: cancelling in-progress backfill...');
      this.abortController.abort();
    }

    if (this.currentBackfillPromise) {
      this.logger.log('Shutdown: waiting for backfill to stop...');
      try {
        await this.currentBackfillPromise;
      } catch {
        // Ignore errors during shutdown - backfill was cancelled
      }
      this.logger.log('Shutdown: backfill stopped');
    }
  }
}
