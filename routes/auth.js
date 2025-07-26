var express = require("express");
var router = express.Router();

module.exports = function (db) {
  // Route GET untuk halaman login
  router.get("/", function (req, res, next) {
    if (req.session.user) {
      return res.redirect("/main"); // sesuaikan prefix jika perlu
    }
    res.render("login", { title: "kendali_pemanas" });
  });

  // Route POST untuk proses login
  router.post("/", function (req, res) {
    const { nama, kelas, nim } = req.body;
    if (
      !nama ||
      !kelas ||
      !nim ||
      nama.trim() === "" ||
      kelas.trim() === "" ||
      nim.trim() === ""
    ) {
      // return res.status(400).send("Semua field harus diisi.");
      return res.status(400).render("login", {
        title: "kendali_pemanas",
        error: "Semua field harus diisi.",
      });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 100);

    // 1. Cek user lain yang sedang aktif (is_logged_in = TRUE)
    db.query(
      "SELECT * FROM public.user WHERE is_logged_in = TRUE",
      [],
      (err, data) => {
        if (err) return res.status(500).send("Database error.");

        if (data.rows.length > 0) {
          const user = data.rows[0];
          // Jika user aktif, cek apakah last_active_at sudah lebih dari 10 menit lalu
          if (
            !user.last_active_at ||
            new Date(user.last_active_at) < tenMinutesAgo
          ) {
            // Reset user lama (anggap logout otomatis)
            db.query(
              "UPDATE public.user SET is_logged_in = FALSE WHERE nim = $1",
              [user.nim],
              (err2) => {
                if (err2)
                  return res
                    .status(500)
                    .send("Database error saat reset user lama.");

                // lanjut proses login
                lanjutkanLogin();
              }
            );
          } else {
            return res.status(403).render("login", {
              title: "kendali_pemanas",
              error: "The device is being used by ${user.nama}-${user.kelas}!",
            });
          }
        } else {
          // Tidak ada user aktif, lanjut login
          lanjutkanLogin();
          console.log("tidak ada user lain yang aktif");
        }

        function lanjutkanLogin() {
          // Cek apakah user dengan nim ini sudah ada
          db.query(
            "SELECT * FROM public.user WHERE nim = $1",
            [nim],
            (err, data) => {
              if (err) return res.status(500).send(err);
              if (data.rows.length > 0) {
                // User sudah ada, update waktu login dan status
                db.query(
                  "UPDATE public.user SET updated_at = NOW(), is_logged_in = TRUE, last_active_at = NOW() WHERE nim = $1 RETURNING *",
                  [nim],
                  (err, result) => {
                    if (err) return res.status(500).send(err);
                    req.session.user = result.rows[0];
                    return res.redirect("/main");
                    console.log("user lama");
                  }
                );
              } else {
                // User belum ada, insert baru
                db.query(
                  "INSERT INTO public.user (nama, kelas, nim, is_logged_in, last_active_at) VALUES ($1, $2, $3, TRUE, NOW()) RETURNING *",
                  [nama, kelas, nim],
                  (err, result) => {
                    if (err) return res.status(500).send(err);
                    req.session.user = result.rows[0];
                    return res.redirect("/main");
                    console.log("user baru");
                  }
                );
              }
            }
          );
        }
      }
    );
  });

  // Route POST untuk logout
  router.post("/logout", function (req, res) {
    if (!req.session.user || !req.session.user.nim) return res.redirect("/");

    const nim = req.session.user.nim;
    req.session.destroy((err) => {
      if (err) return res.status(500).send(err);
      // Set is_logged_in = FALSE
      db.query(
        "UPDATE public.user SET is_logged_in = FALSE WHERE nim = $1",
        [nim],
        (err) => {
          if (err) {
            console.log("Error updating is_logged_in:", err);
            return res.redirect("/");
          }
          // Hapus data pada tabel outputold dan outputcurrent sesuai nim
          db.query("DELETE FROM outputold WHERE nim = $1", [nim], (err) => {
            if (err) console.log("Error deleting from outputold:", err);
            db.query(
              "DELETE FROM outputcurrent WHERE nim = $1",
              [nim],
              (err) => {
                if (err) console.log("Error deleting from outputcurrent:", err);
                res.redirect("/");
              }
            );
          });
        }
      );
    });
  });

  return router;
};
