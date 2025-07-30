// app.js
// file ini adalah entry point untuk aplikasi Express yang menginisialisasi server HTTP dan Socket.IO
require("dotenv").config();
var pg = require("pg");
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var session = require("express-session");
var PgSession = require("connect-pg-simple")(session);
var cors = require("cors");
var logger = require("morgan");
const app = express();
const clientMQTT = require("./mqtt/client.js");
const { pool } = require("./helpers/util");

app.set("trust proxy", 1); // untuk mengizinkan penggunaan session di belakang proxy (misalnya, jika menggunakan Nginx atau Heroku)

pool.connect((err) => {
  // Menghubungkan ke database PostgreSQL
  if (err) {
    console.log("error database", err);
  } else {
    console.log("Connect DB successfully");
  }
});

var allowCrossDomain = function (req, res, next) {
  // Middleware untuk mengizinkan permintaan lintas domain
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
};

var authRouter = require("./routes/auth")(pool);
var mainRouter = require("./routes/main")(pool);

app.set("views", path.join(__dirname, "views")); // Set direktori views untuk EJS
app.set("view engine", "ejs");

app.use(logger("dev")); // Gunakan logger untuk mencatat permintaan HTTP
app.use(express.json()); // Gunakan body-parser untuk mengurai data JSON dari permintaan
app.use(express.urlencoded({ extended: true })); // Gunakan body-parser untuk mengurai data dari permintaan
app.use(bodyParser.json()); // Gunakan body-parser untuk mengurai data JSON
app.use(cookieParser()); // Gunakan cookie-parser untuk mengurai cookie
app.use(express.static(path.join(__dirname, "public"))); // Set direktori statis untuk file publik
app.use("/public", express.static("public"));
app.use(cors());
app.use(allowCrossDomain); // Gunakan middleware untuk mengizinkan permintaan lintas domain
app.use(
  session({
    store: new PgSession({
      // Konfigurasi penyimpanan session menggunakan PostgreSQL
      pool: pool,
      tableName: "session",
    }),
    secret: process.env.SECRETKEY,
    resave: false, // Jangan simpan session jika tidak ada perubahan
    saveUninitialized: false, // Jangan simpan session yang belum diinisialisasi
    cookie: {
      // secure: false, // false untuk developer/lokal | true untuk production/online (bisa tanpa ini jika sudah diatur di .env)
      secure: process.env.NODE_ENV === "production", // AKTIFKAN Cookie hanya dikirim di HTTPS jika dalam produksi
      sameSite: "lax",
      maxAge: 3 * 60 * 60 * 1000, // 3 jam untuk cookie session
    },
  })
);

app.use("/", authRouter);
app.use("/main", checkAuth, mainRouter);

// Middleware untuk memeriksa apakah user sudah login
function checkAuth(req, res, next) {
  if (req.session.user) {
    console.log("Login success. Session is:", req.session);
    next();
  } else {
    res.redirect("/");
  }
}

app.post("/main/pause", async (req, res) => {
  // Endpoint untuk menghentikan proses tuning
  const status = await clientMQTT.publishStop();
  if (status) {
    res.json({ status: "stopped" });
  } else {
    res.status(500).json({ error: "Failed to send STOP command" });
  }
});

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  console.error(err.stack); // Log trace kesalahan ke konsol
  // atur pesan kesalahan dan status
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
