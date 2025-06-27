const database = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Campaign {
  static async createTable() {
    const sql = `
      CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        campaign_type ENUM('referral', 'milestone', 'seasonal', 'promotional') NOT NULL,
        target_audience ENUM('customer', 'driver', 'restaurant', 'all') DEFAULT 'all',
        bonus_amount DECIMAL(8,2) NOT NULL,
        bonus_type ENUM('cash', 'credit', 'percentage') DEFAULT 'credit',
        minimum_requirement DECIMAL(8,2) DEFAULT 0.00,
        max_participants INT,
        current_participants INT DEFAULT 0,
        start_date DATETIME NOT NULL,
        end_date DATETIME NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        terms_conditions TEXT,
        created_by VARCHAR(36),
        metadata JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_type (campaign_type),
        INDEX idx_audience (target_audience),
        INDEX idx_active (is_active),
        INDEX idx_dates (start_date, end_date),
        INDEX idx_created_by (created_by)
      )
    `;
    await database.query(sql);
  }

  static async create(campaignData) {
    const id = uuidv4();
    
    const sql = `
      INSERT INTO campaigns (
        id, name, description, campaign_type, target_audience,
        bonus_amount, bonus_type, minimum_requirement, max_participants,
        start_date, end_date, terms_conditions, created_by, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      id,
      campaignData.name,
      campaignData.description || null,
      campaignData.campaign_type,
      campaignData.target_audience || 'all',
      campaignData.bonus_amount,
      campaignData.bonus_type || 'credit',
      campaignData.minimum_requirement || 0,
      campaignData.max_participants || null,
      campaignData.start_date,
      campaignData.end_date,
      campaignData.terms_conditions || null,
      campaignData.created_by || null,
      JSON.stringify(campaignData.metadata || {})
    ];

    await database.query(sql, params);
    return this.findById(id);
  }

  static async findById(id) {
    const sql = 'SELECT * FROM campaigns WHERE id = ?';
        const results = await database.query(sql, [id]);
        return results[0] || null;
    }
    static async findAll() {
        const sql = 'SELECT * FROM campaigns WHERE is_active = TRUE';
        const results = await database.query(sql);
        return results.map(campaign => {
            if (campaign.metadata) {
                campaign.metadata = JSON.parse(campaign.metadata);
            }
            return campaign;
        });
    }   
    static async update(id, campaignData) {
        const sql = `
            UPDATE campaigns SET
                name = ?,
                description = ?,
                campaign_type = ?,
                target_audience = ?,
                bonus_amount = ?,
                bonus_type = ?,
                minimum_requirement = ?,
                max_participants = ?,
                start_date = ?,
                end_date = ?,
                terms_conditions = ?,
                metadata = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        const params = [
            campaignData.name,
            campaignData.description || null,
            campaignData.campaign_type,
            campaignData.target_audience || 'all',
            campaignData.bonus_amount,
            campaignData.bonus_type || 'credit',
            campaignData.minimum_requirement || 0,
            campaignData.max_participants || null,
            campaignData.start_date,
            campaignData.end_date,
            campaignData.terms_conditions || null,
            JSON.stringify(campaignData.metadata || {}),
            id
        ];

        await database.query(sql, params);
        return this.findById(id);
    }
    static async delete(id) {
        const sql = 'DELETE FROM campaigns WHERE id = ?';
        await database.query(sql, [id]);
        return { success: true, message: 'Campaign deleted successfully' };
    }
    static async findActiveCampaigns() {
        const sql = `
            SELECT * FROM campaigns 
            WHERE is_active = TRUE 
            AND start_date <= NOW() 
            AND end_date >= NOW()
        `;
        const results = await database.query(sql);
        return results.map(campaign => {
            if (campaign.metadata) {
                campaign.metadata = JSON.parse(campaign.metadata);
            }
            return campaign;
        });
    }
    static async findByType(campaignType) {
        const sql = 'SELECT * FROM campaigns WHERE campaign_type = ? AND is_active = TRUE';
        const results = await database.query(sql, [campaignType]);
        return results.map(campaign => {
            if (campaign.metadata) {
                campaign.metadata = JSON.parse(campaign.metadata);
            }
            return campaign;
        });
    }
    static async findByAudience(audience) {
        const sql = 'SELECT * FROM campaigns WHERE target_audience = ? AND is_active = TRUE';
        const results = await database.query(sql, [audience]);
        return results.map(campaign => {
            if (campaign.metadata) {
                campaign.metadata = JSON.parse(campaign.metadata);
            }
            return campaign;
        });
    }
    static async incrementParticipants(id) {
        const sql = `
            UPDATE campaigns 
            SET current_participants = current_participants + 1, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        await database.query(sql, [id]);
        return this.findById(id);
    }
    static async decrementParticipants(id) {
            const sql = `
                UPDATE campaigns 
                SET current_participants = GREATEST(current_participants - 1, 0), updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            await database.query(sql, [id]);
            return this.findById(id);
    }
    static async activateCampaign(id) {
            const sql = `
                UPDATE campaigns 
                SET is_active = TRUE, updated_at = CURRENT_TIMESTAMP 
                WHERE id = ?
            `;
            await database.query(sql, [id]);
            return this.findById(id);
    }
    static async deactivateCampaign(id) {
        const sql = `
            UPDATE campaigns 
            SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP 
            WHERE id = ?
        `;
        await database.query(sql, [id]);
        return this.findById(id);
    }
    static async getCampaignSummary() {
            const sql = `
                SELECT 
                    COUNT(*) AS total_campaigns,
                    SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) AS active_campaigns,
                    SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) AS inactive_campaigns,
                    SUM(current_participants) AS total_participants
                FROM campaigns
            `;
            const results = await database.query(sql);
            return results[0];
    }
    
    static async getCampaignStats(campaignId) {
            const sql = `
                SELECT 
                    COUNT(*) AS total_participants,
                    SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) AS active_participants,
                    SUM(CASE WHEN is_active = FALSE THEN 1 ELSE 0 END) AS inactive_participants
                FROM campaigns
                WHERE id = ?
            `;
            const results = await database.query(sql, [campaignId]);
            return results[0];
    }
    static async getCampaignsByDateRange(startDate, endDate) {
        const sql = `
            SELECT * FROM campaigns 
            WHERE start_date >= ? AND end_date <= ? AND is_active = TRUE
        `;
        const results = await database.query(sql, [startDate, endDate]);
        return results.map(campaign => {
            if (campaign.metadata) {
                campaign.metadata = JSON.parse(campaign.metadata);
            }
            return campaign;
        });
    }
    static async getCampaignsByBonusType(bonusType) {
        const sql = 'SELECT * FROM campaigns WHERE bonus_type = ? AND is_active = TRUE';
        const results = await database.query(sql, [bonusType]);
        return results.map(campaign => {
            if (campaign.metadata) {
                campaign.metadata = JSON.parse(campaign.metadata);
            }
            return campaign;
        });
    }
}
module.exports = Campaign;