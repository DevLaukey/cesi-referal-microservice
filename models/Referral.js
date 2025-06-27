const database = require("../config/database");
const { v4: uuidv4 } = require("uuid");

class Referral {
  static async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS referrals (
        id VARCHAR(36) PRIMARY KEY,
        referrer_id VARCHAR(36) NOT NULL,
        referee_id VARCHAR(36) NOT NULL,
        referrer_type ENUM('customer', 'driver', 'restaurant') NOT NULL,
        referee_type ENUM('customer', 'driver', 'restaurant') NOT NULL,
        referral_code VARCHAR(20) NOT NULL,
        status ENUM('pending', 'completed', 'expired', 'cancelled') DEFAULT 'pending',
        completion_condition ENUM('first_order', 'first_delivery', 'registration') NOT NULL,
        completion_date DATETIME,
        referrer_bonus DECIMAL(8,2) DEFAULT 0.00,
        referee_bonus DECIMAL(8,2) DEFAULT 0.00,
        referrer_bonus_type ENUM('cash', 'credit', 'percentage') DEFAULT 'credit',
        referee_bonus_type ENUM('cash', 'credit', 'percentage') DEFAULT 'credit',
        minimum_order_amount DECIMAL(8,2),
        expiry_date DATETIME,
        campaign_id VARCHAR(36),
        completion_order_id VARCHAR(36),
        completion_delivery_id VARCHAR(36),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_referrer (referrer_id),
        INDEX idx_referee (referee_id),
        INDEX idx_code (referral_code),
        INDEX idx_status (status),
        INDEX idx_expiry (expiry_date),
        INDEX idx_campaign (campaign_id),
        UNIQUE KEY unique_referral (referrer_id, referee_id, referrer_type, referee_type)
      )
    `;
    await database.query(sql);
  }

  static async create(referralData) {
    const id = uuidv4();

    // Set expiry date
    const expiryDate = new Date();
    expiryDate.setDate(
      expiryDate.getDate() + parseInt(process.env.REFERRAL_EXPIRY_DAYS) || 30
    );

    const sql = `
      INSERT INTO referrals (
        id, referrer_id, referee_id, referrer_type, referee_type,
        referral_code, completion_condition, referrer_bonus, referee_bonus,
        referrer_bonus_type, referee_bonus_type, minimum_order_amount,
        expiry_date, campaign_id, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      referralData.referrer_id,
      referralData.referee_id,
      referralData.referrer_type,
      referralData.referee_type,
      referralData.referral_code,
      referralData.completion_condition,
      referralData.referrer_bonus || 0,
      referralData.referee_bonus || 0,
      referralData.referrer_bonus_type || "credit",
      referralData.referee_bonus_type || "credit",
      referralData.minimum_order_amount || 0,
      expiryDate,
      referralData.campaign_id || null,
      JSON.stringify(referralData.metadata || {}),
    ];

    await database.query(sql, params);
    return this.findById(id);
  }

  static async findById(id) {
    const sql = "SELECT * FROM referrals WHERE id = ?";
    const results = await database.query(sql, [id]);
    const referral = results[0];
    if (referral && referral.metadata) {
      referral.metadata = JSON.parse(referral.metadata);
    }
    return referral || null;
  }

  static async findByCode(referralCode) {
    const sql =
      'SELECT * FROM referrals WHERE referral_code = ? AND status = "pending"';
    const results = await database.query(sql, [referralCode]);
    const referrals = results.map((referral) => {
      if (referral.metadata) {
        referral.metadata = JSON.parse(referral.metadata);
      }
      return referral;
    });
    return referrals;
  }

  static async findByReferrer(referrerId, limit = 50, offset = 0) {
    const sql = `
      SELECT * FROM referrals 
      WHERE referrer_id = ? 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `;
    const results = await database.query(sql, [referrerId, limit, offset]);
    return results.map((referral) => {
      if (referral.metadata) {
        referral.metadata = JSON.parse(referral.metadata);
      }
      return referral;
    });
  }

  static async findByReferee(refereeId) {
    const sql =
      "SELECT * FROM referrals WHERE referee_id = ? ORDER BY created_at DESC";
    const results = await database.query(sql, [refereeId]);
    return results.map((referral) => {
      if (referral.metadata) {
        referral.metadata = JSON.parse(referral.metadata);
      }
      return referral;
    });
  }

  static async completeReferral(id, completionData) {
    const sql = `
      UPDATE referrals 
      SET status = 'completed', 
          completion_date = CURRENT_TIMESTAMP,
          completion_order_id = ?,
          completion_delivery_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'pending'
    `;

    const result = await database.query(sql, [
      completionData.order_id || null,
      completionData.delivery_id || null,
      id,
    ]);

    if (result.affectedRows > 0) {
      return this.findById(id);
    }
    return null;
  }

  static async updateStatus(id, status) {
    const sql = `
      UPDATE referrals 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    await database.query(sql, [status, id]);
    return this.findById(id);
  }

  static async getExpiredReferrals() {
    const sql = `
      SELECT * FROM referrals 
      WHERE status = 'pending' AND expiry_date < CURRENT_TIMESTAMP
    `;
    return await database.query(sql);
  }

  static async getReferralStats(
    referrerId = null,
    startDate = null,
    endDate = null
  ) {
    let sql = `
      SELECT 
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_referrals,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_referrals,
        COUNT(CASE WHEN status = 'expired' THEN 1 END) as expired_referrals,
        SUM(referrer_bonus) as total_referrer_bonus,
        SUM(referee_bonus) as total_referee_bonus,
        AVG(DATEDIFF(completion_date, created_at)) as avg_completion_days
      FROM referrals 
      WHERE 1=1
    `;
    let params = [];

    if (referrerId) {
      sql += " AND referrer_id = ?";
      params.push(referrerId);
    }

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

  static async getTopReferrers(limit = 10, period = "month") {
    const dateCondition =
      period === "month"
        ? "created_at >= DATE_SUB(NOW(), INTERVAL 1 MONTH)"
        : period === "week"
        ? "created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)"
        : period === "year"
        ? "created_at >= DATE_SUB(NOW(), INTERVAL 1 YEAR)"
        : "1=1";

    const sql = `
      SELECT 
        referrer_id,
        referrer_type,
        COUNT(*) as total_referrals,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_referrals,
        SUM(referrer_bonus) as total_bonus_earned
      FROM referrals 
      WHERE ${dateCondition}
      GROUP BY referrer_id, referrer_type
      ORDER BY successful_referrals DESC, total_referrals DESC
      LIMIT ?
    `;

    return await database.query(sql, [limit]);
  }
}

module.exports = Referral;
