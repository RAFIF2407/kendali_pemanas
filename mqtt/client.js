// mqtt/client.js
// file ini mengelola koneksi MQTT, menerima pesan, dan menyimpan data ke database
var mqtt = require("async-mqtt");
const { pool } = require("../helpers/util");

// Inisialisasi koneksi MQTT//
const brokerUrl = "mqtts://c0edc1d431244359956f48c792bcbe9e.s1.eu.hivemq.cloud";
const options = {
  username: "MQTTSERVER",
  password: "Indonesia24",
  port: 8883,
};

let mqttClient;
let receivedData = null;
const socketModule = require("../mqtt/socket.js");
const idTuningUser = {}; // Menyimpan idTuning untuk setiap user berdasarkan NIM

function setIdTuningForUser(nim, idTuningBaru) {
  // Fungsi untuk menyimpan idTuning untuk user tertentu
  idTuningUser[nim] = idTuningBaru;
}
function getIdTuningForUser(nim) {
  return idTuningUser[nim];
}

// Fungsi untuk menghubungkan ke topik MQTT dan menangani pesan masuk//
async function connectMQTT(io) {
  try {
    mqttClient = await mqtt.connectAsync(brokerUrl, options);
    console.log("Connected to MQTT broker");

    await mqttClient.subscribe("suhu");
    await mqttClient.subscribe("feedback");
    console.log("Subscribed to topic");

    mqttClient.on("message", async (topic, message, packet) => {
      if (packet && packet.retain) {
        // Cek apakah pesan adalah retained message
        console.log("Ignored retained message:", message.toString());
        return;
      }

      const pesan = message.toString().trim();
      if (topic === "suhu" && pesan === "kickout") {
        // jika menerima pesan kickout maka user aktif akan di logout paksa
        try {
          const result = await pool.query(
            "SELECT nim FROM public.user WHERE is_logged_in = TRUE"
          );
          if (result.rows.length === 0) {
            console.log("Tidak ada user aktif untuk dikickout");
            return;
          }
          const nimAktif = result.rows[0].nim;
          const socketId = socketModule.getSocketIdByNim(nimAktif);
          if (socketId && io) {
            io.to(socketId).emit("force_logout", {
              // Emit event ke frontend untuk logout paksa
              reason: "Kickout by Teacher",
            });
            console.log(
              `User NIM ${nimAktif} dikickout via socket ${socketId}`
            );
          } else {
            console.log(`Socket untuk NIM ${nimAktif} tidak ditemukan`);
          }
        } catch (err) {
          console.error("Error query kickout NIM:", err.message);
        }
        return;
      }

      if (topic === "suhu") {
        // Jika topik adalah suhu, parse data suhu dan emit ke frontend untuk monitoring
        let suhuFloat = null;
        try {
          const parsed = JSON.parse(message.toString());
          if (parsed && typeof parsed.suhu !== "undefined") {
            suhuFloat = parseFloat(parsed.suhu);
          }
        } catch (err) {
          console.error("Failed to parse suhu JSON:", err.message);
          return;
        }
        if (io && suhuFloat !== null)
          io.emit("mqtt-temperature", { suhu: suhuFloat });
      }

      if (topic === "feedback") {
        // topik feedback untuk menerima data output suhu
        const rawMessage = message.toString();
        if (!rawMessage.trim()) {
          console.error("Received empty MQTT message, ignoring.");
          return;
        }
        console.log("Raw message received:", rawMessage);
        let suhu, nim, time;
        try {
          const parsed = JSON.parse(rawMessage);
          nim = String(parsed.NIM).trim();
          if (
            typeof parsed === "object" &&
            parsed !== null &&
            "suhu" in parsed &&
            "NIM" in parsed &&
            "time" in parsed
          ) {
            suhu = parseFloat(parsed.suhu);
            nim = parsed.NIM;
            time = parsed.time;
          } else {
            console.error(
              "Parsed JSON does not contain 'suhu' , 'NIM' and 'time' properties."
            );
            return;
          }
        } catch (err) {
          console.error("Error parsing MQTT message:", err.message);
          return;
        }
        console.log("Received MQTT:", suhu, nim, time);
        if (!time) {
          console.error("time not found in message.");
          return;
        }
        if (!nim) {
          console.error("NIM not found in message.");
          return;
        }

        const idTuningBaru = getIdTuningForUser(nim);
        if (!idTuningBaru) {
          console.error(
            `idTuningBaru belum di-set untuk NIM ${nim}. Data tidak disimpan.`
          );
          return;
        }
        if (!isNaN(suhu)) {
          // Pastikan suhu adalah angka
          try {
            await insertOutputWithSetpoint(nim, suhu, time, idTuningBaru);
            console.log(
              `Waktu ${time} Suhu ${suhu} (dan setpoint) disimpan untuk NIM ${nim}`
            );
          } catch (dbErr) {
            console.error("Database insert error:", dbErr.message);
          }
        } else {
          console.error("Received suhu is not a valid number");
          return;
        }

        if (io) {
          // Jika ada koneksi Socket.IO, emit data suhu ke frontend
          const socketId = socketModule.getSocketIdByNim(nim);
          if (socketId) {
            io.to(socketId).emit("new_suhu", { time, suhu, NIM: nim });
            console.log(`Emit ke NIM ${nim} (socket ${socketId})`);
          } else {
            socketModule.saveMissedData(nim, { time, suhu, NIM: nim }); // Simpan data yang tidak bisa diemit karena socket belum terdaftar
            console.log(`Socket user NIM ${nim} belum terdaftar`);
          }
        }
      }
    });
  } catch (err) {
    console.error("MQTT connection error:", err);
  }
}

async function backupAndClearOutputCurrent(nim, idTuningLama) {
  // Fungsi untuk backup data output saat ini ke tabel outputold dan menghapusnya dari outputcurrent
  try {
    await pool.query(`DELETE FROM public.outputold WHERE nim = $1`, [nim]);

    await pool.query(
      `INSERT INTO public.outputold (suhu, nim, time, id_tuning, set_point, set_point_atas, set_point_bawah, kp, ki, kd, mode)
      SELECT suhu, nim, time, $2, set_point, set_point_atas, set_point_bawah, kp, ki, kd, mode FROM public.outputcurrent WHERE nim = $1`,
      [nim, idTuningLama]
    );
    await pool.query(`DELETE FROM public.outputcurrent WHERE nim = $1`, [nim]);
    console.log(
      `Backup untuk NIM ${nim} selesai. public.Outputold hanya simpan 1 sesi terakhir user ini`
    );
  } catch (err) {
    console.error("Error saat backup data:", err.message);
  }
}

async function insertOutputWithSetpoint(nim, suhu, time, idTuningBaru) {
  // Fungsi untuk memasukkan data output saat ini ke tabel outputcurrent dengan setpoint dari variabel
  const { rows } = await pool.query(
    "SELECT set_point, set_point_atas, set_point_bawah, kp, ki, kd, mode FROM variabel WHERE nim = $1",
    [nim]
  );
  if (rows.length === 0) throw new Error("Data variabel tidak ditemukan");

  const { set_point, set_point_atas, set_point_bawah, kp, ki, kd, mode } =
    rows[0];
  await pool.query(
    `INSERT INTO public.outputcurrent
      (suhu, nim, time, id_tuning, set_point, set_point_atas, set_point_bawah, kp, ki, kd, mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [
      suhu,
      nim,
      time,
      idTuningBaru,
      set_point,
      set_point_atas,
      set_point_bawah,
      kp,
      ki,
      kd,
      mode,
    ]
  );
}

// Fungsi untuk mencoba koneksi kembali jika terjadi kesalahan
async function reconnectMQTT(io) {
  try {
    await connectMQTT(io);
  } catch (err) {
    console.error("Reconnect attempt failed:", err.message);
    setTimeout(reconnectMQTT, 5000);
  }
}

// Fungsi untuk memutuskan koneksi MQTT
async function disconnectMQTT() {
  if (mqttClient && mqttClient.end) {
    try {
      await mqttClient.end();
      console.log("MQTT connection closed");
    } catch (err) {
      console.error("Error while closing MQTT connection:", err.message);
    }
  }
}

// Fungsi untuk mengirim perintah STOP ke broker MQTT
async function publishStop() {
  if (mqttClient) {
    try {
      await mqttClient.publish("input", "STOP");
      console.log("STOP command published to topic stop");
      return true;
    } catch (err) {
      console.error("Failed to publish STOP:", err.message);
      return false;
    }
  } else {
    console.error("MQTT client is not connected");
    return false;
  }
}

// Ekspor fungsi-fungsi untuk digunakan di modul lain
module.exports = {
  connectMQTT,
  disconnectMQTT,
  reconnectMQTT,
  backupAndClearOutputCurrent,
  getClient: () => mqttClient,
  getReceivedData: () => receivedData,
  publishStop,
  setIdTuningForUser,
  getIdTuningForUser,
  insertOutputWithSetpoint,
};
