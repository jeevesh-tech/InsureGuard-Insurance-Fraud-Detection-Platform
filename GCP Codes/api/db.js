const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "127.0.0.1",
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || "insureguard",
  user: process.env.DB_USER || "insureguard_app",
  password: process.env.DB_PASSWORD || "",
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined
});

pool.on("error", err => console.error("PostgreSQL pool error:", err));

module.exports = {
  pool,
  query: (text, params) => pool.query(text, params)
};
