const Campaign = require("../models/Campaign");
const logger = require("../utils/logger");
const { validateCampaign } = require("../validators/referralValidator");

class CampaignController {
  // Create campaign (admin only)
  static async createCampaign(req, res) {
    try {
      if (!["admin", "sales"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const { error, value } = validateCampaign(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      const campaignData = {
        ...value,
        created_by: req.user.id,
      };

      const campaign = await Campaign.create(campaignData);

      logger.info(`Campaign created: ${campaign.id} by user: ${req.user.id}`);

      res.status(201).json({
        success: true,
        message: "Campaign created successfully",
        data: campaign,
      });
    } catch (error) {
      logger.error("Create campaign error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get active campaigns
  static async getActiveCampaigns(req, res) {
    try {
      const { audience } = req.query;
      const campaigns = await Campaign.findActive(audience);

      res.json({
        success: true,
        data: campaigns,
      });
    } catch (error) {
      logger.error("Get active campaigns error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get campaign details
  static async getCampaign(req, res) {
    try {
      const { id } = req.params;
      const campaign = await Campaign.findById(id);

      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      res.json({
        success: true,
        data: campaign,
      });
    } catch (error) {
      logger.error("Get campaign error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get campaign statistics
  static async getCampaignStats(req, res) {
    try {
      if (!["admin", "sales"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const { id } = req.params;
      const stats = await Campaign.getCampaignStats(id);

      if (!stats) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error("Get campaign stats error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Update campaign status
  static async updateCampaignStatus(req, res) {
    try {
      if (!["admin", "sales"].includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      const { id } = req.params;
      const { is_active } = req.body;

      const campaign = await Campaign.findById(id);
      if (!campaign) {
        return res.status(404).json({
          success: false,
          message: "Campaign not found",
        });
      }

      const updatedCampaign = await Campaign.updateStatus(id, is_active);

      res.json({
        success: true,
        message: "Campaign status updated successfully",
        data: updatedCampaign,
      });
    } catch (error) {
      logger.error("Update campaign status error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = CampaignController;
