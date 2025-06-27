const database = require("../config/database");
const { v4: uuidv4 } = require("uuid");

class ReferralCode {
  static async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS referral_codes (
        id VARCHAR(36) PRIMARY KEY,
        owner_id VARCHAR(36) NOT NULL,
        owner_type ENUM('customer', 'driver', 'restaurant') NOT NULL,
        code VARCHAR(20) NOT NULL UNIQUE,
        usage_count INT DEFAULT 0,
        max_usage INT DEFAULT 50,
        is_active BOOLEAN DEFAULT TRUE,
        bonus_amount DECIMAL(8,2) DEFAULT 0.00,
        bonus_type ENUM('cash', 'credit', 'percentage') DEFAULT 'credit',
        minimum_order_amount DECIMAL(8,2) DEFAULT 0.00,
        expiry_date DATETIME,
        campaign_id VARCHAR(36),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_owner (owner_id, owner_type),
        INDEX idx_code (code),
        INDEX idx_active (is_active),
        INDEX idx_campaign (campaign_id)
      )
    `;
    await database.query(sql);
  }

  static async create(codeData) {
    const id = uuidv4();
    const code = codeData.code || this.generateCode(codeData.owner_type);

    const sql = `
      INSERT INTO referral_codes (
        id, owner_id, owner_type, code, max_usage, bonus_amount,
        bonus_type, minimum_order_amount, expiry_date, campaign_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      id,
      codeData.owner_id,
      codeData.owner_type,
      code,
      codeData.max_usage || 50,
      codeData.bonus_amount || this.getDefaultBonus(codeData.owner_type),
      codeData.bonus_type || "credit",
      codeData.minimum_order_amount || 0,
      codeData.expiry_date || null,
      codeData.campaign_id || null,
    ];

    await database.query(sql, params);
    return this.findById(id);
  }

  static async findById(id) {
    const sql = "SELECT * FROM referral_codes WHERE id = ?";
    const results = await database.query(sql, [id]);
    return results[0] || null;
  }

  static async findByCode(code) {
    const sql = "SELECT * FROM referral_codes WHERE code = ?";
    const results = await database.query(sql, [code]);
    return results[0] || null;
  }

  static async findByOwner(ownerId, ownerType) {
    const sql = `
      SELECT * FROM referral_codes 
      WHERE owner_id = ? AND owner_type = ? 
      ORDER BY created_at DESC
    `;
    return await database.query(sql, [ownerId, ownerType]);
  }

  static async incrementUsage(codeId) {
    const sql = `
      UPDATE referral_codes 
      SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    await database.query(sql, [codeId]);
    return this.findById(codeId);
  }

  static async validateCode(code) {
    const sql = `
      SELECT * FROM referral_codes 
      WHERE code = ? 
        AND is_active = TRUE 
        AND usage_count < max_usage 
        AND (expiry_date IS NULL OR expiry_date > CURRENT_TIMESTAMP)
    `;
    const results = await database.query(sql, [code]);
    return results[0] || null;
  }

  static async deactivateCode(codeId) {
    const sql = `
      UPDATE referral_codes 
      SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `;
    const result = await database.query(sql, [codeId]);
    return result.affectedRows > 0;
  }

  static generateCode(ownerType) {
    const prefix =
      ownerType === "customer"
        ? "CUS"
        : ownerType === "driver"
        ? "DRV"
        : ownerType === "restaurant"
        ? "REST"
        : "REF";

    const suffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix}${suffix}`;
  }

  static getDefaultBonus(ownerType) {
    switch (ownerType) {
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
}

module.exports = ReferralCode;
