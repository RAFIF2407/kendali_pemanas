// Import library dan modul yang diperlukan dari server socket io//
const { Server } = require("socket.io");

// Deklarasi variabel untuk menyimpan data yang dikirim dari frontend//
let io; 
const nimToSocketId = new Map();
const missedData = new Map();

module.exports = {
  // Fungsi untuk mendapatkan ID socket berdasarkan NIM//
  init: (server) => {
    if (!io) {
      io = new Server(server, {
        cors: { origin: "*", methods: ["GET", "POST"] }, // Mengatur opsi cors untuk Socket.IO dengan opsi cors dan metode yang diizinkan
      });
      // metode untuk  "connection" pada Socket.IO//
      io.on("connection", (socket) => {
        // Ambil NIM dari query (frontend harus kirim NIM)//
        const nim = String(socket.handshake.query.nim).trim();
        console.log("NIM frontend connect:", nim);
        if (nim) {
          nimToSocketId.set(String(nim).trim(), socket.id);
          socket.nim = nim;
          console.log("User dengan NIM", nim, "terhubung dengan", socket.id);

          if (missedData.has(nim)) {
            missedData
              .get(nim)
              .forEach((payload) => io.to(socket.id).emit("new_suhu", payload));
            missedData.delete(nim);
            console.log(`Backlog data dikirim ke NIM ${nim}`);
          }
        }
        socket.on("disconnect", () => {
          if (socket.nim) nimToSocketId.delete(socket.nim);
        });
      });
    }
    return io;
  },
  // Metode getIO untuk mendapatkan instance Socket.IO yang telah diinisialisasi//
  getIO: () => {
    if (!io) throw new Error("Socket.io not initialized!");
    return io;
  },

  //--mengambil NIM untuk data diri user--//
  getSocketIdByNim: (nim) => {
    return nimToSocketId.get(String(nim).trim());
  },

  // fungsi untuk menyimpan data jika user belum connect ke server socket.io//
  saveMissedData: (nim, payload) => {
    if (!missedData.has(String(nim).trim()))
      missedData.set(String(nim).trim(), []);
    missedData.get(String(nim).trim()).push(payload);
  },
};
