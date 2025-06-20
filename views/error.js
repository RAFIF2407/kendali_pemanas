// middlewares/error.js

module.exports = function (err, req, res, next) {
  // Menetapkan variabel lokal, hanya menyediakan kesalahan di lingkungan pengembangan
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // Menetapkan status respons
  res.status(err.status || 500);

  // Merender halaman kesalahan
  res.render("error");
};
