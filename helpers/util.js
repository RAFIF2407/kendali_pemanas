// helpers/util.js
const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool(
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

class Response {
  constructor(data, success = true) {
    this.success = success;
    this.data = data;
  }
}
module.exports = { pool, Response };
