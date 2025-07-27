var express = require("express");
var router = express.Router();

module.exports = function (db) {
  // fungsi untuk meng-export router
  router.get("/", function (req, res, next) {
    // route untuk masuk ke halaman login
    if (req.session.user) {
      return res.redirect("/main");
    }
    res.render("login", { title: "kendali_pemanas" });
  });

  router.post("/", function (req, res) {
    // route untuk mengirim data login
    const { nama, kelas, nim } = req.body;
    if (
      !nama ||
      !kelas ||
      !nim ||
      nama.trim() === "" ||
      kelas.trim() === "" ||
      nim.trim() === ""
    ) {
      return res.status(400).render("login", {
        title: "kendali_pemanas",
        error: "Semua field harus diisi.",
      });
    }

    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 100);
    db.query(
      "SELECT * FROM public.user WHERE is_logged_in = TRUE",
      [],
      (err, data) => {
        if (err) return res.status(500).send("Database error.");
        if (data.rows.length > 0) {
          const user = data.rows[0];
          if (
            !user.last_active_at ||
            new Date(user.last_active_at) < tenMinutesAgo
          ) {
            // Jika user sudah tidak aktif lebih dari 10 menit maka reset statusnya
            db.query(
              "UPDATE public.user SET is_logged_in = FALSE WHERE nim = $1",
              [user.nim],
              (err2) => {
                if (err2)
                  return res
                    .status(500)
                    .send("Database error saat reset user lama.");
                lanjutkanLogin();
              }
            );
          } else {
            // Jika ada user lain yang masih aktif berikan pesan dibawah
            return res.status(403).render("login", {
              title: "kendali_pemanas",
              error: `The device is being used by ${user.nama}-${user.kelas}!`,
            });
          }
        } else {
          // Jika tidak ada user yang aktif, lanjutkan login ke halaman utama
          lanjutkanLogin();
          console.log("tidak ada user lain yang aktif");
        }

        function lanjutkanLogin() {
          db.query(
            "SELECT * FROM public.user WHERE nim = $1",
            [nim],
            (err, data) => {
              if (err) return res.status(500).send(err);
              if (data.rows.length > 0) {
                // jika data User sudah ada, update waktu login dan status
                db.query(
                  "UPDATE public.user SET updated_at = NOW(), is_logged_in = TRUE, last_active_at = NOW() WHERE nim = $1 RETURNING *",
                  [nim],
                  (err, result) => {
                    if (err) return res.status(500).send(err);
                    req.session.user = result.rows[0];
                    return res.redirect("/main");
                  }
                );
              } else {
                // jika data User belum ada, insert baru data User
                db.query(
                  "INSERT INTO public.user (nama, kelas, nim, is_logged_in, last_active_at) VALUES ($1, $2, $3, TRUE, NOW()) RETURNING *",
                  [nama, kelas, nim],
                  (err, result) => {
                    if (err) return res.status(500).send(err);
                    req.session.user = result.rows[0];
                    return res.redirect("/main");
                  }
                );
              }
            }
          );
        }
      }
    );
  });

  router.post("/logout", function (req, res) {
    if (!req.session.user || !req.session.user.nim) return res.redirect("/");
    const nim = req.session.user.nim;
    req.session.destroy((err) => {
      // Hapus session user saat logout
      if (err) return res.status(500).send(err);
      db.query(
        "UPDATE public.user SET is_logged_in = FALSE WHERE nim = $1",
        [nim],
        (err) => {
          if (err) {
            console.log("Error updating is_logged_in:", err);
            return res.redirect("/");
          }
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

  return router; // Kembalikan router untuk digunakan di app.js
};
