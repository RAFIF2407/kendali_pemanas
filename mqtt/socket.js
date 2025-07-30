// mqtt/socket.js
// file ini menginisialisasi Socket.IO untuk komunikasi real-time antara server dan frontend
const { Server } = require("socket.io");
// Inisialisasi variabel io, nimToSocketId, dan missedData untuk menyimpan data socket dan backlog
let io;
const nimToSocketId = new Map();
const missedData = new Map();

module.exports = {
  init: (server) => {
    if (!io) {
      io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }, // Konfigurasi CORS untuk Socket.IO
      });
      io.on("connection", (socket) => {
        const nim = String(socket.handshake.query.nim).trim();
        console.log("NIM frontend connect:", nim);
        if (nim) {
          // Jika NIM dari frontend ada, simpan ke Map nimToSocketId
          nimToSocketId.set(String(nim).trim(), socket.id);
          socket.nim = nim;
          console.log("User dengan NIM", nim, "terhubung dengan", socket.id);
          if (missedData.has(nim)) {
            missedData
              .get(nim)
              .forEach((payload) => io.to(socket.id).emit("new_suhu", payload)); // Kirim backlog data jika ada
            missedData.delete(nim);
            console.log(`Backlog data dikirim ke NIM ${nim}`);
          }
        }
        socket.on("disconnect", () => {
          // Saat socket terputus, hapus dari Map nimToSocketId
          if (socket.nim) nimToSocketId.delete(socket.nim);
        });
      });
    }
    return io;
  },
  // Fungsi untuk mendapatkan instance Socket.IO
  getIO: () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
  },
  // Fungsi untuk mendapatkan client MQTT atau nim yang terhubung dengan socket
  getSocketIdByNim: (nim) => {
    return nimToSocketId.get(String(nim).trim());
  },

  // fungsi untuk menyimpan data jika user belum connect ke server socket.io
  saveMissedData: (nim, payload) => {
    if (!missedData.has(String(nim).trim()))
      missedData.set(String(nim).trim(), []);
    missedData.get(String(nim).trim()).push(payload);
  },
};
