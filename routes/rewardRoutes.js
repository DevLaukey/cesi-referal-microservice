const express = require("express");
const RewardController = require("../controllers/rewardController");
const auth = require("../middleware/auth");
const router = express.Router();

// Reward management
router.get('/', auth, RewardController.getUserRewards);
router.get('/summary', auth, RewardController.getRewardSummary);
router.post('/:id/claim', auth, RewardController.claimReward);
router.get('/stats', auth, RewardController.getRewardStats);

module.exports = router;