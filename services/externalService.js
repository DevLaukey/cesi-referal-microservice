const axios = require("axios");
const logger = require("../utils/logger");

class ExternalServices {
  constructor() {
    this.userServiceUrl = process.env.USER_SERVICE_URL;
    this.notificationServiceUrl = process.env.NOTIFICATION_SERVICE_URL;
    this.paymentServiceUrl = process.env.PAYMENT_SERVICE_URL;
    this.apiKey = process.env.SERVICE_API_KEY;
  }

  async makeRequest(url, method = "GET", data = null) {
    try {
      const config = {
        method,
        url,
        headers: {
          "Content-Type": "application/json",
          "X-Service-Key": this.apiKey,
        },
        timeout: 10000,
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      logger.error(`External service request failed: ${url}`, error.message);
      throw error;
    }
  }

  async getUserDetails(userId, userType) {
    try {
      const endpoint =
        userType === "restaurant"
          ? `${this.userServiceUrl}/api/restaurants/${userId}`
          : `${this.userServiceUrl}/api/users/${userId}`;

      const response = await this.makeRequest(endpoint);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get user details ${userId}:`, error.message);
      return null;
    }
  }

  async sendNotification(userId, notificationData) {
    try {
      await this.makeRequest(
        `${this.notificationServiceUrl}/api/notifications`,
        "POST",
        { user_id: userId, ...notificationData }
      );
    } catch (error) {
      logger.error("Failed to send notification:", error.message);
    }
  }

  async creditUserAccount(userId, amount, metadata = {}) {
    try {
      await this.makeRequest(`${this.paymentServiceUrl}/api/credits`, "POST", {
        user_id: userId,
        amount: amount,
        ...metadata,
      });
    } catch (error) {
      logger.error("Failed to credit user account:", error.message);
      throw error;
    }
  }
}

module.exports = new ExternalServices();
