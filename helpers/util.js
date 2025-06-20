// helpers/util.js
const { Pool } = require("pg");
require("dotenv").config();

// Konfigurasi koneksi database
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
});

class Response {
  constructor(data, success = true) {
    this.success = success;
    this.data = data;
  }
}
module.exports = { pool, Response };
