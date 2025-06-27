const database = require("../config/database");
const { v4: uuidv4 } = require("uuid");

class Reward {
  static async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS rewards (
        id VARCHAR(36) PRIMARY KEY,
        user_id VARCHAR(36) NOT NULL,
        user_type ENUM('customer', 'driver', 'restaurant') NOT NULL,
        reward_type ENUM('referral_bonus', 'milestone_bonus', 'campaign_bonus', 'loyalty_bonus') NOT NULL,
        amount DECIMAL(8,2) NOT NULL,
        currency VARCHAR(3) DEFAULT 'USD',
        status ENUM('pending', 'credited', 'expired', 'cancelled') DEFAULT 'pending',
        credited_date DATETIME,
        expiry_date DATETIME,
        source_id VARCHAR(36),
        source_type ENUM('referral', 'campaign', 'milestone', 'manual') NOT NULL,
        description TEXT,
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_user (user_id),
        INDEX idx_status (status),
        INDEX idx_source (source_id, source_type),
        INDEX idx_expiry (expiry_date),
        INDEX idx_created_at (created_at)
      )
    `;
    await database.query(sql);
  }

  static async create(rewardData) {
    const id = uuidv4();

    // Set expiry date (30 days from now if not specified)
    const expiryDate =
      rewardData.expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const sql = `
      INSERT INTO rewards (
        id, user_id, user_type, reward_type, amount, currency,
        expiry_date, source_id, source_type, description, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      rewardData.user_id,
      rewardData.user_type,
      rewardData.reward_type,
      rewardData.amount,
      rewardData.currency || "USD",
      expiryDate,
      rewardData.source_id || null,
      rewardData.source_type,
      rewardData.description || null,
      JSON.stringify(rewardData.metadata || {}),
    ];

    await database.query(sql, params);
    return this.findById(id);
  }

  static async findById(id) {
    const sql = "SELECT * FROM rewards WHERE id = ?";
    const results = await database.query(sql, [id]);
    const reward = results[0];
    if (reward && reward.metadata) {
      reward.metadata = JSON.parse(reward.metadata);
    }
    return reward || null;
  }

  static async findByUser(userId, status = null, limit = 50, offset = 0) {
    let sql = `SELECT * FROM rewards WHERE user_id = ?`;
    const params = [userId];

    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(limit, offset);

    const results = await database.query(sql, params);
    return results.map((reward) => {
      if (reward.metadata) {
        reward.metadata = JSON.parse(reward.metadata);
      }
      return reward;
    });
  }

  static async creditReward(id) {
    const sql = `
      UPDATE rewards 
      SET status = 'credited', 
          credited_date = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `;

    const result = await database.query(sql, [id]);
    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    return null;
  }

  static async updateStatus(id, status) {
    const sql = `
      UPDATE rewards 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    await database.query(sql, [status, id]);
    return this.findById(id);
  }

  static async getExpiredRewards() {
    const sql = `
      SELECT * FROM rewards 
      WHERE status = 'pending' AND expiry_date < CURRENT_TIMESTAMP
    `;
    return await database.query(sql);
  }

  static async getUserRewardSummary(userId) {
    const sql = `
      SELECT 
        COUNT(*) as total_rewards,
        SUM(CASE WHEN status = 'credited' THEN amount ELSE 0 END) as total_credited,
        SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
        COUNT(CASE WHEN status = 'credited' THEN 1 END) as credited_count,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_count
      FROM rewards 
      WHERE user_id = ?
    `;

    const results = await database.query(sql, [userId]);
    return results[0];
  }

  static async getRewardStats(startDate = null, endDate = null) {
    let sql = `
      SELECT 
        COUNT(*) as total_rewards,
        SUM(amount) as total_amount,
        COUNT(CASE WHEN status = 'credited' THEN 1 END) as credited_rewards,
        SUM(CASE WHEN status = 'credited' THEN amount ELSE 0 END) as credited_amount,
        COUNT(CASE WHEN reward_type = 'referral_bonus' THEN 1 END) as referral_rewards,
        COUNT(CASE WHEN reward_type = 'milestone_bonus' THEN 1 END) as milestone_rewards,
        AVG(amount) as average_reward_amount
      FROM rewards 
      WHERE 1=1
    `;
    let params = [];

    if (startDate) {
      sql += " AND created_at >= ?";
      params.push(startDate);
    }

    if (endDate) {
      sql += " AND created_at <= ?";
      params.push(endDate);
    }

    const results = await database.query(sql, params);
    return results[0];
  }
}

module.exports = Reward;
