const cron = require("node-cron");
const Referral = require("../models/Referral");
const Reward = require("../models/Reward");
const logger = require("../utils/logger");

class CronJobService {
  static initializeCronJobs() {
    // Expire old referrals - runs daily at 2 AM
    cron.schedule("0 2 * * *", async () => {
      try {
        logger.info("Running referral expiry job");
        const expiredReferrals = await Referral.getExpiredReferrals();

        for (const referral of expiredReferrals) {
          await Referral.updateStatus(referral.id, "expired");
          logger.info(`Expired referral: ${referral.id}`);
        }

        logger.info(`Expired ${expiredReferrals.length} referrals`);
      } catch (error) {
        logger.error("Referral expiry job error:", error);
      }
    });

    // Expire old rewards - runs daily at 3 AM
    cron.schedule("0 3 * * *", async () => {
      try {
        logger.info("Running reward expiry job");
        const expiredRewards = await Reward.getExpiredRewards();

        for (const reward of expiredRewards) {
          await Reward.updateStatus(reward.id, "expired");
          logger.info(`Expired reward: ${reward.id}`);
        }

        logger.info(`Expired ${expiredRewards.length} rewards`);
      } catch (error) {
        logger.error("Reward expiry job error:", error);
      }
    });

    // Generate weekly referral reports - runs Mondays at 9 AM
    cron.schedule("0 9 * * 1", async () => {
      try {
        logger.info("Generating weekly referral report");
        await this.generateWeeklyReport();
      } catch (error) {
        logger.error("Weekly report generation error:", error);
      }
    });

    logger.info("Cron jobs initialized successfully");
  }

  static async generateWeeklyReport() {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);

      const stats = await Referral.getReferralStats(null, startDate, endDate);
      const topReferrers = await Referral.getTopReferrers(10, "week");
      const rewardStats = await Reward.getRewardStats(startDate, endDate);

      const report = {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        referral_stats: stats,
        top_referrers: topReferrers,
        reward_stats: rewardStats,
        generated_at: new Date().toISOString(),
      };

      logger.info("Weekly referral report generated:", report);

      // Here you could send the report via email or save to a file
      // await emailService.sendWeeklyReport(report);
    } catch (error) {
      logger.error("Generate weekly report error:", error);
      throw error;
    }
  }
}

module.exports = CronJobService;
