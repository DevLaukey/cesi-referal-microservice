const Referral = require("../models/Referral");
const ReferralCode = require("../models/ReferralCode");
const Reward = require("../models/Reward");
const Campaign = require("../models/Campaign");
const logger = require("../utils/logger");
const {
  validateReferral,
  validateReferralCode,
} = require("../validators/referralValidator");
const externalServices = require("../services/externalServices");
const rewardService = require("../services/externalService");

class ReferralController {
  // Create referral
  static async createReferral(req, res) {
    try {
      const { error, value } = validateReferral(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      // Validate referral code
      const referralCode = await ReferralCode.validateCode(value.referral_code);
      if (!referralCode) {
        return res.status(400).json({
          success: false,
          message: "Invalid or expired referral code",
        });
      }

      // Check if referrer and referee are different
      if (referralCode.owner_id === value.referee_id) {
        return res.status(400).json({
          success: false,
          message: "Cannot refer yourself",
        });
      }

      // Check for existing referral
      const existingReferrals = await Referral.findByReferee(value.referee_id);
      const existingReferral = existingReferrals.find(
        (r) =>
          r.referrer_id === referralCode.owner_id &&
          r.referrer_type === referralCode.owner_type
      );

      if (existingReferral) {
        return res.status(409).json({
          success: false,
          message: "Referral already exists between these users",
        });
      }

      // Get active campaign if applicable
      const activeCampaigns = await Campaign.findActive(
        referralCode.owner_type
      );
      const campaign = activeCampaigns.length > 0 ? activeCampaigns[0] : null;

      // Create referral
      const referralData = {
        referrer_id: referralCode.owner_id,
        referee_id: value.referee_id,
        referrer_type: referralCode.owner_type,
        referee_type: value.referee_type,
        referral_code: value.referral_code,
        completion_condition: this.getCompletionCondition(value.referee_type),
        referrer_bonus: campaign
          ? campaign.bonus_amount
          : referralCode.bonus_amount,
        referee_bonus: this.getRefereeBonus(value.referee_type),
        minimum_order_amount: referralCode.minimum_order_amount,
        campaign_id: campaign ? campaign.id : null,
      };

      const referral = await Referral.create(referralData);

      // Increment code usage
      await ReferralCode.incrementUsage(referralCode.id);

      // Increment campaign participants if applicable
      if (campaign) {
        await Campaign.incrementParticipants(campaign.id);
      }

      // Send notifications
      await this.sendReferralNotifications(referral);

      logger.info(`Referral created: ${referral.id}`);

      res.status(201).json({
        success: true,
        message: "Referral created successfully",
        data: referral,
      });
    } catch (error) {
      logger.error("Create referral error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Complete referral (triggered by external events)
  static async completeReferral(req, res) {
    try {
      const { referral_id, order_id, delivery_id } = req.body;

      if (!referral_id) {
        return res.status(400).json({
          success: false,
          message: "Referral ID is required",
        });
      }

      const referral = await Referral.findById(referral_id);
      if (!referral) {
        return res.status(404).json({
          success: false,
          message: "Referral not found",
        });
      }

      if (referral.status !== "pending") {
        return res.status(400).json({
          success: false,
          message: "Referral is not in pending status",
        });
      }

      // Complete the referral
      const completedReferral = await Referral.completeReferral(referral_id, {
        order_id,
        delivery_id,
      });

      if (completedReferral) {
        // Process rewards
        await rewardService.processReferralRewards(completedReferral);

        // Send completion notifications
        await this.sendCompletionNotifications(completedReferral);

        logger.info(`Referral completed: ${referral_id}`);

        res.json({
          success: true,
          message: "Referral completed successfully",
          data: completedReferral,
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Failed to complete referral",
        });
      }
    } catch (error) {
      logger.error("Complete referral error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get referral by code
  static async getReferralByCode(req, res) {
    try {
      const { code } = req.params;

      // Validate the code first
      const referralCode = await ReferralCode.validateCode(code);
      if (!referralCode) {
        return res.status(404).json({
          success: false,
          message: "Invalid or expired referral code",
        });
      }

      // Get owner details (this would typically call user service)
      const ownerDetails = await externalServices.getUserDetails(
        referralCode.owner_id,
        referralCode.owner_type
      );

      res.json({
        success: true,
        data: {
          code: referralCode.code,
          owner_type: referralCode.owner_type,
          bonus_amount: referralCode.bonus_amount,
          bonus_type: referralCode.bonus_type,
          minimum_order_amount: referralCode.minimum_order_amount,
          owner_name: ownerDetails ? ownerDetails.name : "Anonymous",
          usage_count: referralCode.usage_count,
          max_usage: referralCode.max_usage,
        },
      });
    } catch (error) {
      logger.error("Get referral by code error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get user referrals
  static async getUserReferrals(req, res) {
    try {
      const { page = 1, limit = 20, type = "sent" } = req.query;
      const offset = (page - 1) * limit;

      let referrals;
      if (type === "sent") {
        referrals = await Referral.findByReferrer(
          req.user.id,
          parseInt(limit),
          offset
        );
      } else {
        referrals = await Referral.findByReferee(req.user.id);
      }

      res.json({
        success: true,
        data: referrals,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: referrals.length,
        },
      });
    } catch (error) {
      logger.error("Get user referrals error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get referral statistics
  static async getReferralStats(req, res) {
    try {
      const { start_date, end_date } = req.query;
      const referrerId = req.query.referrer_id || req.user.id;

      // Check authorization
      if (
        referrerId !== req.user.id &&
        !["admin", "sales"].includes(req.user.role)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const stats = await Referral.getReferralStats(
        referrerId,
        start_date,
        end_date
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Get referral stats error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Process referral by external trigger
  static async processReferralTrigger(req, res) {
    try {
      const { referee_id, referee_type, trigger_type, trigger_data } = req.body;

      // Find pending referrals for this referee
      const refereeReferrals = await Referral.findByReferee(referee_id);
      const pendingReferrals = refereeReferrals.filter(
        (r) => r.status === "pending"
      );

      const completedReferrals = [];

      for (const referral of pendingReferrals) {
        // Check if trigger matches completion condition
        const shouldComplete = this.shouldCompleteReferral(
          referral,
          trigger_type,
          trigger_data
        );

        if (shouldComplete) {
          const completed = await Referral.completeReferral(
            referral.id,
            trigger_data
          );
          if (completed) {
            await rewardService.processReferralRewards(completed);
            await this.sendCompletionNotifications(completed);
            completedReferrals.push(completed);
          }
        }
      }

      res.json({
        success: true,
        message: `Processed ${completedReferrals.length} referrals`,
        data: {
          completed_count: completedReferrals.length,
          completed_referrals: completedReferrals,
        },
      });
    } catch (error) {
      logger.error("Process referral trigger error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Helper methods
  static getCompletionCondition(refereeType) {
    switch (refereeType) {
      case "customer":
        return "first_order";
      case "driver":
        return "first_delivery";
      case "restaurant":
        return "registration";
      default:
        return "first_order";
    }
  }

  static getRefereeBonus(refereeType) {
    switch (refereeType) {
      case "customer":
        return parseFloat(process.env.CUSTOMER_REFERRAL_BONUS) || 10.0;
      case "driver":
        return parseFloat(process.env.DRIVER_REFERRAL_BONUS) || 25.0;
      case "restaurant":
        return parseFloat(process.env.RESTAURANT_REFERRAL_BONUS) || 50.0;
      default:
        return 10.0;
    }
  }

  static shouldCompleteReferral(referral, triggerType, triggerData) {
    switch (referral.completion_condition) {
      case "first_order":
        return (
          triggerType === "order_completed" &&
          triggerData.customer_id === referral.referee_id &&
          (!referral.minimum_order_amount ||
            triggerData.amount >= referral.minimum_order_amount)
        );

      case "first_delivery":
        return (
          triggerType === "delivery_completed" &&
          triggerData.driver_id === referral.referee_id
        );

      case "registration":
        return (
          triggerType === "user_verified" &&
          triggerData.user_id === referral.referee_id
        );

      default:
        return false;
    }
  }

  static async sendReferralNotifications(referral) {
    try {
      // Notify referrer
      await externalServices.sendNotification(referral.referrer_id, {
        type: "referral_created",
        message: "Someone used your referral code!",
        referral_id: referral.id,
      });

      // Notify referee
      await externalServices.sendNotification(referral.referee_id, {
        type: "referral_received",
        message: `You'll earn ${referral.referee_bonus} when you complete your first order!`,
        referral_id: referral.id,
      });
    } catch (error) {
      logger.error("Failed to send referral notifications:", error);
    }
  }

  static async sendCompletionNotifications(referral) {
    try {
      // Notify referrer about completion
      await externalServices.sendNotification(referral.referrer_id, {
        type: "referral_completed",
        message: `Congratulations! Your referral earned you ${referral.referrer_bonus}`,
        referral_id: referral.id,
      });

      // Notify referee about their bonus
      await externalServices.sendNotification(referral.referee_id, {
        type: "referral_bonus_earned",
        message: `You've earned ${referral.referee_bonus} from your referral!`,
        referral_id: referral.id,
      });
    } catch (error) {
      logger.error("Failed to send completion notifications:", error);
    }
  }
}

module.exports = ReferralController;
