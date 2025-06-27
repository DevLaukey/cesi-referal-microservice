const fs = require("fs");
const path = require("path");

// Read SSL certificate if it exists
let sslConfig = false;
const caCertPath = process.env.DB_SSL_CA_PATH;

if (caCertPath && fs.existsSync(caCertPath)) {
  sslConfig = {
    ca: fs.readFileSync(caCertPath),
  };
}

module.exports = {
  development: {
    username: process.env.DB_USERNAME ,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    dialectOptions: {
      ssl: process.env.DB_SSL_REQUIRE === "true" ? sslConfig : false,
    },
  },
  test: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME_TEST,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    dialectOptions: {
      ssl: process.env.DB_SSL_REQUIRE === "true" ? sslConfig : false,
    },
    logging: false,
  },
  production: {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    dialectOptions: {
      ssl: process.env.DB_SSL_REQUIRE === "true" ? sslConfig : false,
      connectTimeout: 60000,
      acquireTimeout: 60000,
      timeout: 60000,
    },
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 60000,
      idle: 10000,
    },
    retry: {
      match: [
        /ETIMEDOUT/,
        /EHOSTUNREACH/,
        /ECONNRESET/,
        /ECONNREFUSED/,
        /ETIMEDOUT/,
        /ESOCKETTIMEDOUT/,
        /EHOSTUNREACH/,
        /EPIPE/,
        /EAI_AGAIN/,
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
      ],
      max: 3,
    },
  },
};
