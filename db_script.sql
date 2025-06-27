
 -- Create database
 CREATE DATABASE IF NOT EXISTS referral_microservice_db 
 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
 
 USE referral_microservice_db;
 
 -- Referrals table
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
 );
 
 -- Referral codes table
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
 );
 
 -- Rewards table
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
 );
 
 -- Campaigns table
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
 );
 