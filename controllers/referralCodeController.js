const ReferralCode = require("../models/ReferralCode");
const logger = require("../utils/logger");
const { validateReferralCode } = require("../validators/referralValidator");

class ReferralCodeController {
  // Create referral code
  static async createReferralCode(req, res) {
    try {
      const { error, value } = validateReferralCode(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          message: "Validation error",
          errors: error.details.map((detail) => detail.message),
        });
      }

      // Check if user already has an active code
      const existingCodes = await ReferralCode.findByOwner(
        req.user.id,
        req.user.role
      );
      const activeCodes = existingCodes.filter((code) => code.is_active);

      if (activeCodes.length > 0 && !req.body.allow_multiple) {
        return res.status(409).json({
          success: false,
          message: "User already has an active referral code",
          data: activeCodes[0],
        });
      }

      const codeData = {
        ...value,
        owner_id: req.user.id,
        owner_type: req.user.role,
      };

      const referralCode = await ReferralCode.create(codeData);

      logger.info(
        `Referral code created: ${referralCode.code} for user: ${req.user.id}`
      );

      res.status(201).json({
        success: true,
        message: "Referral code created successfully",
        data: referralCode,
      });
    } catch (error) {
      logger.error("Create referral code error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Get user's referral codes
  static async getUserReferralCodes(req, res) {
    try {
      const codes = await ReferralCode.findByOwner(req.user.id, req.user.role);

      res.json({
        success: true,
        data: codes,
      });
    } catch (error) {
      logger.error("Get user referral codes error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Validate referral code
  static async validateReferralCode(req, res) {
    try {
      const { code } = req.params;
      const validCode = await ReferralCode.validateCode(code);

      if (!validCode) {
        return res.status(404).json({
          success: false,
          message: "Invalid or expired referral code",
        });
      }

      res.json({
        success: true,
        data: {
          valid: true,
          code: validCode.code,
          bonus_amount: validCode.bonus_amount,
          bonus_type: validCode.bonus_type,
          minimum_order_amount: validCode.minimum_order_amount,
          usage_count: validCode.usage_count,
          max_usage: validCode.max_usage,
        },
      });
    } catch (error) {
      logger.error("Validate referral code error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }

  // Deactivate referral code
  static async deactivateReferralCode(req, res) {
    try {
      const { id } = req.params;

      const code = await ReferralCode.findById(id);
      if (!code) {
        return res.status(404).json({
          success: false,
          message: "Referral code not found",
        });
      }

      if (
        code.owner_id !== req.user.id &&
        !["admin", "sales"].includes(req.user.role)
      ) {
        return res.status(403).json({
          success: false,
          message: "Access denied",
        });
      }

      await ReferralCode.deactivateCode(id);

      res.json({
        success: true,
        message: "Referral code deactivated successfully",
      });
    } catch (error) {
      logger.error("Deactivate referral code error:", error);
      res.status(500).json({
        success: false,
        message: "Internal server error",
      });
    }
  }
}

module.exports = ReferralCodeController;
