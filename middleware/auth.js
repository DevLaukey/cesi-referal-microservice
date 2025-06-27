const jwt = require("jsonwebtoken");
const logger = require("../utils/logger");

const auth = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "");

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    logger.error("Authentication error:", error);
    res.status(401).json({
      success: false,
      message: "Invalid token",
    });
  }
};

module.exports = auth;
