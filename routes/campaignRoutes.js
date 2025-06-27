const express = require("express");
const CampaignController = require("../controllers/campaignController");
const auth = require("../middleware/auth");
const router = express.Router();

// Campaign management
router.post("/", auth, CampaignController.createCampaign);
router.get("/active", CampaignController.getActiveCampaigns); // Public endpoint
router.get("/:id", CampaignController.getCampaign); // Public endpoint
router.get("/:id/stats", auth, CampaignController.getCampaignStats);
router.patch("/:id/status", auth, CampaignController.updateCampaignStatus);

module.exports = router;
