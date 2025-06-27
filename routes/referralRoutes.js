const express = require("express");
const ReferralController = require("../controllers/referralController");
const ReferralCodeController = require("../controllers/referralCodeController");
const auth = require("../middleware/auth");
const router = express.Router();

// Referral management
router.post("/", auth, ReferralController.createReferral);
router.post("/complete", auth, ReferralController.completeReferral);
router.post("/trigger", ReferralController.processReferralTrigger); // No auth - internal service call
router.get("/code/:code", ReferralController.getReferralByCode); // Public endpoint
router.get("/user", auth, ReferralController.getUserReferrals);
router.get("/stats", auth, ReferralController.getReferralStats);

// Referral codes
router.post("/codes", auth, ReferralCodeController.createReferralCode);
router.get("/codes", auth, ReferralCodeController.getUserReferralCodes);
router.get(
  "/codes/:code/validate",
  ReferralCodeController.validateReferralCode
); // Public endpoint
router.delete(
  "/codes/:id",
  auth,
  ReferralCodeController.deactivateReferralCode
);

module.exports = router;
