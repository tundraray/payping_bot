import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
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
 */
@Injectable()
export class AnalyticsSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AnalyticsSchedulerService.name);

  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Run backfill on application startup.
   * This ensures classifications are recalculated with the correct algorithm.
   */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Application bootstrap: starting analytics backfill...');
    try {
      const processed = await this.analyticsService.backfillAnalytics();
      this.logger.log(`Bootstrap backfill completed: ${processed} transactions processed`);
    } catch (error) {
      this.logger.error('Bootstrap backfill failed', { error });
    }
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
    try {
      const processed = await this.analyticsService.backfillAnalytics();
      this.logger.log(`Daily backfill completed: ${processed} transactions processed`);
    } catch (error) {
      this.logger.error('Daily backfill failed', { error });
    }
  }
}
