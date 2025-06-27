const Reward = require('../models/Reward');
const Referral = require('../models/Referral');
const Campaign = require('../models/Campaign');
const logger = require('../utils/logger');
const externalServices = require('./externalServices');

class RewardService {
  // Process referral rewards when referral is completed
  static async processReferralRewards(referral) {
    try {
      logger.info(`Processing referral rewards for referral: ${referral.id}`);

      // Create reward for referrer (person who referred)
      const referrerReward = await Reward.create({
        user_id: referral.referrer_id,
        user_type: referral.referrer_type,
        reward_type: 'referral_bonus',
        amount: referral.referrer_bonus,
        source_id: referral.id,
        source_type: 'referral',
        description: `Referral bonus for successfully referring a ${referral.referee_type}`,
        metadata: {
          referral_id: referral.id,
          referee_id: referral.referee_id,
          referee_type: referral.referee_type,
          completion_condition: referral.completion_condition
        }
      });

      // Create reward for referee (person who was referred)
      const refereeReward = await Reward.create({
        user_id: referral.referee_id,
        user_type: referral.referee_type,
        reward_type: 'referral_bonus',
        amount: referral.referee_bonus,
        source_id: referral.id,
        source_type: 'referral',
        description: `Welcome bonus for being referred by a ${referral.referrer_type}`,
        metadata: {
          referral_id: referral.id,
          referrer_id: referral.referrer_id,
          referrer_type: referral.referrer_type,
          completion_condition: referral.completion_condition
        }
      });

      // Auto-credit referee reward (welcome bonus)
      await this.creditReward(refereeReward.id);

      // Check if referrer achieved any milestones
      const milestoneRewards = await this.checkMilestoneAchievements(
        referral.referrer_id, 
        referral.referrer_type
      );

      // Send notifications
      await this.sendRewardNotifications(referrerReward, refereeReward);

      logger.info(`Referral rewards processed: referrer ${referrerReward.id}, referee ${refereeReward.id}`);

      return {
        referrer_reward: referrerReward,
        referee_reward: refereeReward,
        milestone_rewards: milestoneRewards
      };

    } catch (error) {
      logger.error('Process referral rewards error:', error);
      throw error;
    }
  }

  // Process milestone rewards when user reaches referral milestones
  static async processMilestoneReward(userId, userType, milestone, metadata = {}) {
    try {
      logger.info(`Processing milestone reward: ${milestone} for user: ${userId}`);

      // Define milestone amounts
      const milestoneAmounts = {
        5: parseFloat(process.env.MILESTONE_BONUS_5) || 15.00,
        10: parseFloat(process.env.MILESTONE_BONUS_10) || 30.00,
        25: parseFloat(process.env.MILESTONE_BONUS_25) || 75.00,
        50: parseFloat(process.env.MILESTONE_BONUS_50) || 150.00,
        100: parseFloat(process.env.MILESTONE_BONUS_100) || 300.00
      };

      const amount = milestoneAmounts[milestone];
      if (!amount) {
        logger.warn(`Unknown milestone: ${milestone}`);
        return null;
      }

      // Check if milestone reward already exists
      const existingRewards = await Reward.findByUser(userId, null, 1000, 0);
      const hasMilestoneReward = existingRewards.some(r => 
        r.reward_type === 'milestone_bonus' && 
        r.metadata && 
        JSON.parse(r.metadata || '{}').milestone === milestone
      );

      if (hasMilestoneReward) {
        logger.info(`Milestone ${milestone} reward already exists for user: ${userId}`);
        return null;
      }

      // Create milestone reward
      const reward = await Reward.create({
        user_id: userId,
        user_type: userType,
        reward_type: 'milestone_bonus',
        amount: amount,
        source_type: 'milestone',
        description: `Milestone bonus for reaching ${milestone} successful referrals! 🎉`,
        metadata: {
          milestone: milestone,
          achievement_date: new Date().toISOString(),
          ...metadata
        }
      });

      // Auto-credit milestone rewards immediately
      await this.creditReward(reward.id);

      // Send celebration notification
      await externalServices.sendNotification(userId, {
        type: 'milestone_achieved',
        message: `Congratulations! You've reached ${milestone} referrals and earned $${amount}!`,
        milestone: milestone,
        amount: amount,
        emoji: '🎉🏆'
      });

      logger.info(`Milestone reward created and credited: ${reward.id} for milestone ${milestone}`);

      return reward;

    } catch (error) {
      logger.error('Process milestone reward error:', error);
      throw error;
    }
  }

  // Credit reward to user account
  static async creditReward(rewardId) {
    try {
      const reward = await Reward.findById(rewardId);
      if (!reward) {
        logger.error(`Reward not found: ${rewardId}`);
        return null;
      }

      if (reward.status !== 'pending') {
        logger.info(`Reward ${rewardId} is not pending (status: ${reward.status})`);
        return reward;
      }

      logger.info(`Crediting reward: ${rewardId} amount: $${reward.amount} to user: ${reward.user_id}`);

      // Credit through payment service
      const creditResult = await externalServices.creditUserAccount(reward.user_id, reward.amount, {
        type: 'referral_reward',
        source_id: reward.id,
        description: reward.description,
        reward_type: reward.reward_type
      });

      if (creditResult.success) {
        // Update reward status to credited
        const creditedReward = await Reward.creditReward(rewardId);

        // Send success notification
        await externalServices.sendNotification(reward.user_id, {
          type: 'reward_credited',
          message: `$${reward.amount} has been credited to your account!`,
          amount: reward.amount,
          reward_type: reward.reward_type,
          description: reward.description
        });

        logger.info(`Reward credited successfully: ${rewardId}`);
        return creditedReward;
      } else {
        logger.error(`Failed to credit reward: ${rewardId}`, creditResult.error);
        return null;
      }

    } catch (error) {
      logger.error('Credit reward error:', error);
      throw error;
    }
  }

  // Process campaign rewards
  static async processCampaignReward(userId, userType, campaignId, customAmount = null, customDescription = null) {
    try {
      const campaign = await Campaign.findById(campaignId);
      if (!campaign) {
        logger.error(`Campaign not found: ${campaignId}`);
        return null;
      }

      if (!campaign.is_active) {
        logger.error(`Campaign is not active: ${campaignId}`);
        return null;
      }

      // Check if campaign is still running
      const now = new Date();
      if (now < new Date(campaign.start_date) || now > new Date(campaign.end_date)) {
        logger.error(`Campaign is not running: ${campaignId}`);
        return null;
      }

      // Check participant limits
      if (campaign.max_participants && campaign.current_participants >= campaign.max_participants) {
        logger.error(`Campaign participant limit reached: ${campaignId}`);
        return null;
      }

      const amount = customAmount || campaign.bonus_amount;
      const description = customDescription || `Campaign bonus: ${campaign.name}`;

      const reward = await Reward.create({
        user_id: userId,
        user_type: userType,
        reward_type: 'campaign_bonus',
        amount: amount,
        source_id: campaignId,
        source_type: 'campaign',
        description: description,
        metadata: {
          campaign_id: campaignId,
          campaign_name: campaign.name,
          campaign_type: campaign.campaign_type
        }
      });

      // Increment campaign participants
      await Campaign.incrementParticipants(campaignId);

      logger.info(`Campaign reward created: ${reward.id} for campaign: ${campaignId}`);

      return reward;

    } catch (error) {
      logger.error('Process campaign reward error:', error);
      throw error;
    }
  }

  // Check and process milestone achievements
  static async checkMilestoneAchievements(userId, userType) {
    try {
      logger.info(`Checking milestone achievements for user: ${userId}`);

      // Get user's successful referral count
      const stats = await Referral.getReferralStats(userId);
      const completedReferrals = stats.completed_referrals || 0;

      logger.info(`User ${userId} has ${completedReferrals} completed referrals`);

      // Define milestone thresholds
      const milestones = [5, 10, 25, 50, 100];
      const achievedMilestones = [];

      for (const milestone of milestones) {
        if (completedReferrals >= milestone) {
          const reward = await this.processMilestoneReward(userId, userType, milestone);
          if (reward) {
            achievedMilestones.push(reward);
          }
        }
      }

      if (achievedMilestones.length > 0) {
        logger.info(`User ${userId} achieved ${achievedMilestones.length} new milestones`);
      }

      return achievedMilestones;

    } catch (error) {
      logger.error('Check milestone achievements error:', error);
      return [];
    }
  }

  // Process first-time user bonus
  static async processFirstTimeBonus(userId, userType, triggerType = 'registration') {
    try {
      // Check if user already received first-time bonus
      const existingRewards = await Reward.findByUser(userId, null, 100, 0);
      const hasFirstTimeBonus = existingRewards.some(r => r.reward_type === 'loyalty_bonus');

      if (hasFirstTimeBonus) {
        logger.info(`First-time bonus already exists for user: ${userId}`);
        return null;
      }

      const bonusAmount = parseFloat(process.env.FIRST_ORDER_BONUS) || 5.00;

      const reward = await Reward.create({
        user_id: userId,
        user_type: userType,
        reward_type: 'loyalty_bonus',
        amount: bonusAmount,
        source_type: 'manual',
        description: `Welcome bonus for joining our platform! 🎉`,
        metadata: {
          trigger_type: triggerType,
          first_time_bonus: true
        }
      });

      // Auto-credit welcome bonus
      await this.creditReward(reward.id);

      logger.info(`First-time bonus created: ${reward.id} for user: ${userId}`);

      return reward;

    } catch (error) {
      logger.error('Process first-time bonus error:', error);
      throw error;
    }
  }

  // Bulk process rewards (for batch operations)
  static async bulkProcessRewards(rewardRequests) {
    try {
      logger.info(`Processing ${rewardRequests.length} rewards in bulk`);

      const results = [];

      for (const request of rewardRequests) {
        try {
          let reward = null;

          switch (request.type) {
            case 'referral':
              const rewardData = await this.processReferralRewards(request.data);
              reward = rewardData;
              break;

            case 'milestone':
              reward = await this.processMilestoneReward(
                request.user_id, 
                request.user_type, 
                request.milestone
              );
              break;

            case 'campaign':
              reward = await this.processCampaignReward(
                request.user_id, 
                request.user_type, 
                request.campaign_id,
                request.amount,
                request.description
              );
              break;

            case 'first_time':
              reward = await this.processFirstTimeBonus(
                request.user_id, 
                request.user_type,
                request.trigger_type
              );
              break;

            default:
              logger.error(`Unknown reward type: ${request.type}`);
              continue;
          }

          results.push({
            success: true,
            request: request,
            reward: reward
          });

        } catch (error) {
          logger.error(`Bulk reward processing error for request:`, request, error);
          results.push({
            success: false,
            request: request,
            error: error.message
          });
        }
      }

      logger.info(`Bulk processing completed: ${results.length} results`);

      return results;

    } catch (error) {
      logger.error('Bulk process rewards error:', error);
      throw error;
    }
  }

  // Get user reward analytics
  static async getUserRewardAnalytics(userId) {
    try {
      const summary = await Reward.getUserRewardSummary(userId);
      const recentRewards = await Reward.findByUser(userId, null, 10, 0);
      const referralStats = await Referral.getReferralStats(userId);

      // Calculate potential earnings from pending referrals
      const pendingReferrals = await Referral.findByReferrer(userId, 100, 0);
      const pendingEarnings = pendingReferrals
        .filter(r => r.status === 'pending')
        .reduce((sum, r) => sum + parseFloat(r.referrer_bonus), 0);

      // Check next milestone
      const completedReferrals = referralStats.completed_referrals || 0;
      const milestones = [5, 10, 25, 50, 100];
      const nextMilestone = milestones.find(m => m > completedReferrals);
      const progressToNext = nextMilestone ? 
        ((completedReferrals / nextMilestone) * 100).toFixed(1) : 100;

      return {
        summary: summary,
        recent_rewards: recentRewards,
        referral_stats: referralStats,
        pending_earnings: pendingEarnings,
        next_milestone: nextMilestone,
        progress_to_next_milestone: progressToNext,
        analytics: {
          total_lifetime_earnings: summary.total_credited,
          average_reward_amount: summary.credited_count > 0 ? 
            (summary.total_credited / summary.credited_count).toFixed(2) : 0,
          referral_conversion_rate: referralStats.total_referrals > 0 ? 
            ((referralStats.completed_referrals / referralStats.total_referrals) * 100).toFixed(1) : 0
        }
      };

    } catch (error) {
      logger.error('Get user reward analytics error:', error);
      throw error;
    }
  }

  // Expire old rewards
  static async expireOldRewards() {
    try {
      const expiredRewards = await Reward.getExpiredRewards();
      
      for (const reward of expiredRewards) {
        await Reward.updateStatus(reward.id, 'expired');
        
        // Send expiration notification
        await externalServices.sendNotification(reward.user_id, {
          type: 'reward_expired',
          message: `Your $${reward.amount} reward has expired`,
          amount: reward.amount,
          expired_date: new Date().toISOString()
        });
        
        logger.info(`Reward expired: ${reward.id}`);
      }

      logger.info(`Expired ${expiredRewards.length} rewards`);
      return expiredRewards.length;

    } catch (error) {
      logger.error('Expire old rewards error:', error);
      throw error;
    }
  }

  // Send reward notifications
  static async sendRewardNotifications(referrerReward, refereeReward) {
    try {
      // Notify referrer
      await externalServices.sendNotification(referrerReward.user_id, {
        type: 'referral_reward_earned',
        message: `Great news! You've earned $${referrerReward.amount} for your successful referral! 🎉`,
        amount: referrerReward.amount,
        reward_id: referrerReward.id,
        description: referrerReward.description
      });

      // Notify referee
      await externalServices.sendNotification(refereeReward.user_id, {
        type: 'welcome_bonus_credited',
        message: `Welcome! Your $${refereeReward.amount} welcome bonus has been credited to your account! 🎁`,
        amount: refereeReward.amount,
        reward_id: refereeReward.id,
        description: refereeReward.description
      });

    } catch (error) {
      logger.error('Send reward notifications error:', error);
    }
  }

  // Validate reward eligibility
  static async validateRewardEligibility(userId, rewardType, sourceId = null) {
    try {
      // General eligibility checks
      const userRewards = await Reward.findByUser(userId, null, 1000, 0);

      switch (rewardType) {
        case 'referral_bonus':
          // Check if referral reward already exists for this source
          const hasReferralReward = userRewards.some(r => 
            r.reward_type === 'referral_bonus' && r.source_id === sourceId
          );
          return !hasReferralReward;

        case 'milestone_bonus':
          // Check if milestone reward already exists
          const hasMilestoneReward = userRewards.some(r => 
            r.reward_type === 'milestone_bonus' && 
            JSON.parse(r.metadata || '{}').milestone === sourceId
          );
          return !hasMilestoneReward;

        case 'campaign_bonus':
          // Check campaign specific rules
          const campaign = await Campaign.findById(sourceId);
          if (!campaign || !campaign.is_active) return false;
          
          const hasCampaignReward = userRewards.some(r => 
            r.reward_type === 'campaign_bonus' && r.source_id === sourceId
          );
          return !hasCampaignReward;

        case 'loyalty_bonus':
          // Check if first-time bonus already given
          const hasLoyaltyBonus = userRewards.some(r => r.reward_type === 'loyalty_bonus');
          return !hasLoyaltyBonus;

        default:
          return true;
      }

    } catch (error) {
      logger.error('Validate reward eligibility error:', error);
      return false;
    }
  }

  // Get reward leaderboard
  static async getRewardLeaderboard(userType = null, period = 'month', limit = 10) {
    try {
      const dateCondition = period === 'month' ? 'created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)' :
                           period === 'week' ? 'created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)' :
                           period === 'year' ? 'created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)' : '1=1';

      let sql = `
        SELECT 
          user_id,
          user_type,
          COUNT(*) as total_rewards,
          SUM(amount) as total_amount,
          COUNT(CASE WHEN status = 'credited' THEN 1 END) as credited_rewards
        FROM rewards 
        WHERE ${dateCondition}
      `;

      if (userType) {
        sql += ` AND user_type = '${userType}'`;
      }

      sql += `
        GROUP BY user_id, user_type
        ORDER BY total_amount DESC, credited_rewards DESC
        LIMIT ${limit}
      `;

      const results = await require('../config/database').query(sql);

      // Enhance with user details
      const enhancedResults = [];
      for (const result of results) {
        const userDetails = await externalServices.getUserDetails(result.user_id, result.user_type);
        enhancedResults.push({
          ...result,
          user_name: userDetails ? userDetails.name : 'Anonymous',
          user_avatar: userDetails ? userDetails.avatar : null
        });
      }

      return enhancedResults;

    } catch (error) {
      logger.error('Get reward leaderboard error:', error);
      return [];
    }
  }
}

module.exports = RewardService;

// ----------------------------------------------------------------
// Example Usage and Integration
// ----------------------------------------------------------------

/*
// Example 1: Process referral completion
const rewardService = require('./rewardService');

// When a referral is completed
const referral = {
  id: 'ref123',
  referrer_id: 'user123',
  referee_id: 'user456',
  referrer_type: 'customer',
  referee_type: 'customer',
  referrer_bonus: 10.00,
  referee_bonus: 10.00,
  completion_condition: 'first_order'
};

const rewards = await rewardService.processReferralRewards(referral);
console.log('Rewards created:', rewards);

// Example 2: Check milestone achievements
const milestones = await rewardService.checkMilestoneAchievements('user123', 'customer');
console.log('New milestones achieved:', milestones);

// Example 3: Process campaign reward
const campaignReward = await rewardService.processCampaignReward(
  'user123', 
  'customer', 
  'campaign456',
  25.00,
  'Special holiday bonus!'
);

// Example 4: Get user analytics
const analytics = await rewardService.getUserRewardAnalytics('user123');
console.log('User reward analytics:', analytics);

// Example 5: Bulk process rewards
const rewardRequests = [
  {
    type: 'referral',
    data: referral
  },
  {
    type: 'milestone',
    user_id: 'user123',
    user_type: 'customer',
    milestone: 5
  },
  {
    type: 'first_time',
    user_id: 'user789',
    user_type: 'customer',
    trigger_type: 'registration'
  }
];

const bulkResults = await rewardService.bulkProcessRewards(rewardRequests);
console.log('Bulk processing results:', bulkResults);

// Example 6: Get leaderboard
const leaderboard = await rewardService.getRewardLeaderboard('customer', 'month', 10);
console.log('Top reward earners:', leaderboard);
*/

// ----------------------------------------------------------------
// Integration with Other Services
// ----------------------------------------------------------------

/*
// Integration with Order Service
// When an order is completed, trigger referral completion
const orderCompleted = async (orderData) => {
  // Check if this is user's first order
  const isFirstOrder = await checkIfFirstOrder(orderData.customer_id);
  
  if (isFirstOrder) {
    // Trigger referral completion
    const response = await axios.post('/api/referrals/trigger', {
      referee_id: orderData.customer_id,
      referee_type: 'customer',
      trigger_type: 'order_completed',
      trigger_data: {
        order_id: orderData.id,
        amount: orderData.total_amount
      }
    });
    
    // Process first-time bonus
    await rewardService.processFirstTimeBonus(
      orderData.customer_id, 
      'customer', 
      'first_order'
    );
  }
};

// Integration with Delivery Service
// When a driver completes their first delivery
const deliveryCompleted = async (deliveryData) => {
  const isFirstDelivery = await checkIfFirstDelivery(deliveryData.driver_id);
  
  if (isFirstDelivery) {
    // Trigger referral completion for driver
    await axios.post('/api/referrals/trigger', {
      referee_id: deliveryData.driver_id,
      referee_type: 'driver',
      trigger_type: 'delivery_completed',
      trigger_data: {
        delivery_id: deliveryData.id
      }
    });
  }
};

// Integration with User Service
// When a restaurant completes verification
const restaurantVerified = async (restaurantData) => {
  // Trigger referral completion for restaurant
  await axios.post('/api/referrals/trigger', {
    referee_id: restaurantData.id,
    referee_type: 'restaurant',
    trigger_type: 'verification_completed',
    trigger_data: {
      restaurant_id: restaurantData.id
    }
  });
  
  // Process first-time bonus
  await rewardService.processFirstTimeBonus(
    restaurantData.id, 
    'restaurant', 
    'verification'
  );
};
*/