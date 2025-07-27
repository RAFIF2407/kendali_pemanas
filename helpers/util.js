const { Pool } = require("pg");
require("dotenv").config(); // Memuat variabel dari file .env untuk konfigurasi database

const pool = new Pool( // Konfigurasi koneksi ke database PostgreSQL
  process.env.DB_URL
    ? {
        connectionString: process.env.DB_URL,
        ssl: { rejectUnauthorized: false },
      }
    : {
        host: process.env.PGHOST,
        port: process.env.PGPORT,
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        database: process.env.PGNAME,
      }
);

class Response { // Kelas untuk membungkus response dari database
  constructor(data, success = true) {
    this.success = success;
    this.data = data;
  }
}
module.exports = { pool, Response };
