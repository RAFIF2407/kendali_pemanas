require("dotenv").config();
var pg = require("pg");
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var bodyParser = require("body-parser");
var session = require("express-session");
var cors = require("cors");
var logger = require("morgan");
const app = express();
const clientMQTT = require("./mqtt/client.js");

const { pool } = require("./helpers/util");
pool.connect((err) => {
  if (err) {
    console.log("error database", err);
  } else {
    console.log("Connect DB successfully");
  }
});

var allowCrossDomain = function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  next();
};

var authRouter = require("./routes/auth")(pool);
var mainRouter = require("./routes/main")(pool);
var datagetRouter = require("./routes/dataget")(pool);

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.use("/public", express.static("public"));
app.use(cors());
app.use(allowCrossDomain);
app.use(
  session({
    secret: process.env.SECRETKEY,
    resave: false,
    saveUninitialized: true,
  })
);

app.use("/", authRouter);
app.use("/main", checkAuth, mainRouter);
app.use("/info", datagetRouter);

// Middleware untuk memeriksa apakah user sudah login
function checkAuth(req, res, next) {
  if (req.session.user) {
    // Jika user sudah login, lanjutkan ke rute /main
    next();
  } else {
    // Jika user belum login, redirect ke halaman login
    res.redirect("/");
  }
}

//stop handler
// app.post("/main/stop", checkAuth, (req, res) => {
//   // Logika menghentikan sistem
//   console.log("Stop command received");
//   res.send("Stopped");
// });

// Route untuk stop tuning
app.post("/main/pause", async (req, res) => {
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

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
