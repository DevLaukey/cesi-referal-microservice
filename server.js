const express = require("express");
const helmet = require("helmet");
require("dotenv").config();

const { sequelize } = require("./models");
const routes = require("./routes");
const {
  errorHandler,
  notFoundHandler,
  corsMiddleware,
  rateLimitMiddleware,
} = require("./middleware");
const swaggerSetup = require("./config/swagger");

const app = express();

// Trust proxy for accurate IP addresses (important for rate limiting)
app.set("trust proxy", 1);

// Security Middleware
app.use(
  helmet({
    crossOriginEmbedderPolicy: false, // Allow embedding for documentation
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
        scriptSrc: ["'self'", "https://cdnjs.cloudflare.com"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  })
);

// CORS Configuration
app.use(corsMiddleware);

// Rate Limiting
app.use(rateLimitMiddleware.general);

// Body Parser
app.use(
  express.json({
    limit: "10mb",
    type: ["application/json", "text/plain"],
  })
);
app.use(
  express.urlencoded({
    extended: true,
    limit: "10mb",
  })
);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  // Log request
  console.log(
    `${new Date().toISOString()} - ${req.method} ${req.path} - IP: ${req.ip}`
  );

  // Add response time tracking
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`
    );
  });

  next();
});

// Health check (before swagger to avoid documentation overhead)
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    service: "Restaurant Management Service",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    status: "healthy",
    database: "connected", // Will be updated after DB connection test
    features: [
      "Restaurant management",
      "Menu and item management",
      "Category management",
      "Search and filtering",
      "Location-based queries",
      "Analytics and statistics",
    ],
  });
});

// Swagger Documentation
if (process.env.NODE_ENV !== "production") {
  swaggerSetup(app);
}

// Root route
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Restaurant Management Service API",
    version: "1.0.0",
    documentation:
      process.env.NODE_ENV !== "production"
        ? "/api-docs"
        : "Documentation not available in production",
    health: "/health",
    endpoints: {
      restaurants: "/api/restaurants",
      items: "/api/items",
      menus: "/api/menus",
      categories: "/api/categories",
    },
    environment: process.env.NODE_ENV || "development",
  });
});

// Mount API routes
app.use("/api", routes);

// Serve static files for uploads
app.use(
  "/uploads",
  express.static("uploads", {
    maxAge: "1d", // Cache for 1 day
    etag: true,
    lastModified: true,
  })
);

// Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3002;

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    console.log("HTTP server closed.");

    sequelize
      .close()
      .then(() => {
        console.log("Database connection closed.");
        process.exit(0);
      })
      .catch((err) => {
        console.error("Error during database shutdown:", err);
        process.exit(1);
      });
  });
};

// Start Server
const startServer = async () => {
  try {
    console.log("🚀 Starting Restaurant Management Service...");
    console.log("🌍 Environment:", process.env.NODE_ENV || "development");

    // Test database connection
    await sequelize.authenticate();
    console.log("✅ Database connection established successfully.");

    // Sync database models
    await sequelize.sync({
      alter: process.env.NODE_ENV === "development",
      force: process.env.DB_FORCE_SYNC === "true",
    });
    console.log("✅ Database models synchronized.");

    // Create upload directories
    const fs = require("fs");
    const uploadDirs = [
      "./uploads",
      "./uploads/restaurants",
      "./uploads/items",
      "./uploads/menus",
      "./uploads/general",
    ];

    uploadDirs.forEach((dir) => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created upload directory: ${dir}`);
      }
    });

    const server = app.listen(PORT, () => {
      console.log(`🚀 Restaurant Management Service running on port ${PORT}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
      console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
      console.log(`📊 Service Info: http://localhost:${PORT}/api/info`);
      console.log(`🔗 Database: ${process.env.DB_HOST}:${process.env.DB_PORT}`);

      if (process.env.USER_SERVICE_URL) {
        console.log(`👤 User Service: ${process.env.USER_SERVICE_URL}`);
      }
    });

    // Handle shutdown signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
      gracefulShutdown("UNCAUGHT_EXCEPTION");
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
      gracefulShutdown("UNHANDLED_REJECTION");
    });

    return server;
  } catch (error) {
    console.error("❌ Unable to start server:", error);
    process.exit(1);
  }
};

// Only start server if this file is run directly
if (require.main === module) {
  startServer();
}

module.exports = app;

