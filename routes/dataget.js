var express = require("express");
var router = express.Router(); // Router untuk Express

module.exports = function (db) {
  /* GET pengguna di dalam tabel users. */
  router.get("/users", function (req, res, next) {
    db.query(
      "SELECT * FROM public.user ORDER BY GREATEST(created_at, updated_at) DESC LIMIT 1",
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).send("Database query error");
        }

        console.log(result.rows.length); // Log jumlah hasil
        res.json(result.rows[0]); // Kirim hasil ke client
      }
    );
  });

  router.get("/datainput", async function (req, res, next) {
    try {
      const query = `
        SELECT 
          u.nama, 
          u.kelas, 
          u.nim, 
          v.set_point, 
          v.kp, 
          v.ki, 
          v.kd, 
          v.time_sampling, 
          v.mode, 
          v.set_point_atas, 
          v.set_point_bawah
        FROM public.variabel v
        INNER JOIN public.user u ON v.nim = u.nim
        ORDER BY v.updated_at DESC
        LIMIT 1;
      `;
      const result = await db.query(query);
      console.log("Data variabel dengan user:", result.rows);
      res.json(result.rows[0]); // Kembalikan baris pertama
    } catch (err) {
      console.error("Database error:", err.stack);
      res
        .status(500)
        .json({ error: "Database query error", details: err.message });
    }
  });

  router.get("/variabel", function (req, res, next) {
    db.query(
      "SELECT * FROM public.variabel ORDER BY GREATEST(updated_at) DESC LIMIT 1",
      (err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res.status(500).send("Database query error");
        }

        console.log("Jumlah baris:", result.rows.length);
        if (result.rows.length > 0) {
          return res.json(result.rows); // Kirim semua hasil
        } else {
          return res.status(404).json({ message: "Data not found" });
        }
      }
    );
  });

  return router; // Kembalikan router
};
