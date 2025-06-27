const Reward = require("../models/Reward");
const logger = require("../utils/logger");
const externalServices = require("../services/externalServices");

class RewardController {
  // Get user rewards
  static async getUserRewards(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      const offset = (page - 1) * limit;

      const rewards = await Reward.findByUser(
        req.user.id,
        status,
        parseInt(limit),
        offset
      );

      res.json({
        success: true,
        data: rewards,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: rewards.length,
        },
      });
    } catch (error) {
      logger.error("Get user rewards error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get reward summary
  static async getRewardSummary(req, res) {
    try {
      const summary = await Reward.getUserRewardSummary(req.user.id);

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error("Get reward summary error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Claim reward (credit to user account)
  static async claimReward(req, res) {
    try {
      const { id } = req.params;

      const reward = await Reward.findById(id);
      if (!reward) {
        return res.status(404).json({
          success: false,
          message: "Reward not found",
        });
      }

      if (reward.user_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      if (reward.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Reward cannot be claimed",
        });
      }

      // Credit the reward
      const creditedReward = await Reward.creditReward(id);

      if (creditedReward) {
        // Process the actual credit (this would integrate with payment service)
        await externalServices.creditUserAccount(
          reward.user_id,
          reward.amount,
          {
            type: "referral_reward",
            source_id: reward.id,
            description: reward.description,
          }
        );

        // Send notification
        await externalServices.sendNotification(reward.user_id, {
          type: "reward_credited",
          message: `${reward.amount} has been credited to your account`,
          amount: reward.amount,
        });

        logger.info(`Reward claimed: ${id} by user: ${reward.user_id}`);

        res.json({
          success: true,
          message: "Reward claimed successfully",
          data: creditedReward,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to claim reward",
        });
      }
    } catch (error) {
      logger.error("Claim reward error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get reward statistics (admin only)
  static async getRewardStats(req, res) {
    try {
      if (!["admin", "sales"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const { start_date, end_date } = req.query;
      const stats = await Reward.getRewardStats(start_date, end_date);

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Get reward stats error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = RewardController;
