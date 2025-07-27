var express = require("express");
var router = express.Router();
var mqttClientModule = require("../mqtt/client");

module.exports = function (db) {
  function requireLogin(req, res, next) {
    // Middleware untuk memastikan user sudah login
    if (!req.session.user) {
      return res.redirect("/");
    }
    next();
  }

  router.get("/", requireLogin, function (req, res, next) {
    console.log("Session data:", req.session);
    res.set("Cache-Control", "no-store"); // Set cache control untuk mencegah caching
    return res.render("main", { user: req.session.user }); // Render halaman utama dengan data user dari session
  });

  router.post("/data", requireLogin, async function (req, res, next) {
    if (!req.session.user) {
      return res.status(401).json({ error: "User not authenticated" });
    }
    const parseFloatValue = (value) => {
      if (value === null || value === undefined || value === "") {
        return 0.0;
      }
      const num = parseFloat(value);
      return isNaN(num) ? 0.0 : num; // Mengembalikan 0.0 jika parsing gagal
    };

    const {
      set_point = null,
      kp = null,
      ki = null,
      kd = null,
      time_sampling = null,
      mode,
      set_point_atas = null,
      set_point_bawah = null,
      id_tuning,
    } = req.body;

    const validatedKp = parseFloatValue(kp);
    const validatedKi = parseFloatValue(ki);
    const validatedKd = parseFloatValue(kd);
    const validatedTimeSampling = parseFloatValue(time_sampling);
    const validatedSetPoint = parseFloatValue(set_point);
    const validatedSetPointAtas = parseFloatValue(set_point_atas);
    const validatedSetPointBawah = parseFloatValue(set_point_bawah);

    if (mode === null || mode === undefined) {
      return res.status(400).json({ error: "Mode is required." });
    }

    const nim = req.session.user.nim;
    const userCheck = await db.query(
      "SELECT 1 FROM public.user WHERE nim = $1",
      [nim]
    );
    if (userCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ error: "NIM tidak ditemukan di database." });
    }

    const lastTuning = await db.query(
      // Ambil id_tuning terakhir untuk NIM yang sedang aktif
      "SELECT id_tuning FROM outputcurrent WHERE nim = $1 ORDER BY time DESC LIMIT 1",
      [nim]
    );
    const idTuningLama =
      lastTuning.rows.length > 0 ? lastTuning.rows[0].id_tuning : null; // Ambil id_tuning lama jika ada, jika tidak ada maka null
    if (idTuningLama) {
      await mqttClientModule.backupAndClearOutputCurrent(nim, idTuningLama);
    }
    await mqttClientModule.setIdTuningForUser(nim, id_tuning); // Set id_tuning untuk user yang sedang aktif

    const values = [
      validatedSetPoint,
      validatedKp,
      validatedKi,
      validatedKd,
      validatedTimeSampling,
      mode,
      validatedSetPointAtas,
      validatedSetPointBawah,
      nim,
    ];
    try {
      const checkVar = await db.query(
        "SELECT 1 FROM public.variabel WHERE nim = $1",
        [nim]
      );
      if (checkVar.rows.length > 0) {
        // Jika data variabel sudah ada, lakukan update data dengan nim yang sesuai
        const updateQuery = `
          UPDATE public.variabel
          SET set_point = $1, kp = $2, ki = $3, kd = $4, time_sampling = $5, mode = $6, set_point_atas = $7, set_point_bawah = $8
          WHERE nim = $9
          RETURNING *
        `;
        const result = await db.query(updateQuery, values);
        if (result.rowCount === 0) {
          return res.status(500).json({ error: "Database error" });
        }
        res.status(200).json({ message: "Data updated successfully" });
        console.log("Data updated successfully");
      } else {
        const insertQuery = `
          INSERT INTO public.variabel (set_point, kp, ki, kd, time_sampling, mode, set_point_atas, set_point_bawah, nim)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *
        `; // Jika data variabel belum ada, lakukan insert data baru
        await db.query(insertQuery, values);
        res.status(200).json({ message: "Data inserted successfully" });
        console.log("Data inserted successfully");
      }
    } catch (err) {
      console.error("Database error:", err.stack);
      return res
        .status(500)
        .json({ error: "Database query error", details: err.message });
    }

    const dataToSend = {
      Sp: validatedSetPoint,
      Kp: validatedKp,
      Ki: validatedKi,
      Kd: validatedKd,
      Time: validatedTimeSampling,
      Mode: mode,
      TSPH: validatedSetPointAtas,
      TSPL: validatedSetPointBawah,
      NIM: nim,
    }; // Data yang akan dikirim ke broker MQTT
    try {
      await mqttClientModule.backupAndClearOutputCurrent(nim);
      console.log("Backup feedback sukses untuk NIM:", nim);
    } catch (err) {
      console.error("Error backup feedback:", err.message);
    }

    const mqttClient = mqttClientModule.getClient(); // Ambil client MQTT yang sudah terhubung dari module mqtt/client.js
    if (mqttClient) {
      try {
        await mqttClient.publish("input", JSON.stringify(dataToSend));
        console.log("Data sent:", dataToSend);
      } catch (err) {
        console.error("Publish error:", err);
      }
    } else {
      console.error("MQTT client is not initialized");
    }
  });

  router.get("/get-output", requireLogin, async function (req, res, next) {
    // routes mengambil data output saat ini untuk ditampilkan di grafik
    const nim = req.session.user.nim;
    try {
      const result = await db.query(
        `SELECT oc.suhu, oc.time, oc.set_point, oc.set_point_atas, oc.set_point_bawah, oc.kp, oc.ki, oc.kd, v.mode
        FROM outputcurrent oc
        JOIN variabel v ON oc.nim = v.nim
        WHERE oc.nim = $1
        ORDER BY oc.time ASC`,
        [nim]
      );
      res.json(result.rows);
    } catch (err) {
      res
        .status(500)
        .json({ error: "Database query error", details: err.message });
    }
  });

  router.get("/get-old-output", requireLogin, async function (req, res, next) {
    // routes mengambil data output satu sesi sebelumnya untuk ditampilkan di grafik
    const nim = req.session.user.nim;
    try {
      const result = await db.query(
        `SELECT suhu, time, set_point, set_point_atas, set_point_bawah, kp, ki, kd, mode
        FROM outputold
        WHERE nim = $1
        ORDER BY time ASC`,
        [nim]
      );
      res.json(result.rows);
    } catch (err) {
      res
        .status(500)
        .json({ error: "Database query error", details: err.message });
    }
  });

  router.get("/prefill-variabel", requireLogin, async (req, res) => {
    // routes untuk mengambil data variabel mode PID yang diinputkan user
    const nim = req.session.user.nim;
    try {
      const { rows } = await db.query(
        `SELECT kp, ki, kd, set_point FROM public.variabel
        WHERE nim = $1 ORDER BY updated_at DESC LIMIT 1`,
        [nim]
      );
      res.json(rows[0] || { kp: null, ki: null, kd: null, set_point: null }); // Mengembalikan nilai kosong jika tidak ada data di database
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Database query error" });
    }
  });

  router.post("/heartbeat", function (req, res) {
    // routes untuk menjaga agar session tetap aktif saat proses tuning masih dilakukan
    if (!req.session.user) return res.status(401).send("Not logged in");
    const nim = req.session.user.nim;
    db.query(
      "UPDATE public.user SET last_active_at = NOW() WHERE nim = $1",
      [nim],
      (err) => {
        if (err) return res.status(500).send("DB error");
        res.send("OK");
      }
    );
  });

  return router;
};
