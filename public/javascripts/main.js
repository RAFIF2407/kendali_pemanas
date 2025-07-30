let sudahKonek = false;
let socketAlertTimeout = null;
let alertCounter = 0;
let suhuTimeout = null;
const SUHU_TIMEOUT_MS = 5000;
let tuningActive = false;
let tuningTimeout = null;
let suhuTerakhir = null;

(async function initApp() {
  // Inisialisasi koneksi ke server Socket.IO dan cek session untuk menghindari redirect ke halaman login
  try {
    const res = await fetch("/main/heartbeat", { method: "POST" }); // heartbeat untuk cek session
    if (res.status === 401 || res.redirected) {
      window.location.href = "/";
      return;
    }
    // Inisialisasi koneksi Socket.IO dengan NIM dari session
    socket = io("https://pid-trainer-heather.up.railway.app/", {
      query: { nim: String(window.myNim).trim() },
    });
    setupSocketHandlers();
  } catch (e) {
    console.error("Gagal cek session:", e);
    window.location.href = "/";
  }
})();
updateStatus();

function setupSocketHandlers() {
  // fungsi untuk setup koneksi Socket.IO
  socket.on("connect", () => {
    sudahKonek = true;
    updateStatus();
    console.log("Terhubung ke server Socket.IO, id:", socket.id);
    resetListener();
  });

  socket.on("disconnect", () => {
    sudahKonek = false;
    updateStatus();
    console.log("Terputus dari server Socket.IO");
  });

  socket.on("mqtt-temperature", function (data) {
    // fungsi untuk menerima data suhu melalui Socket.IO
    let suhu = parseFloat(data.suhu);
    if (!isNaN(suhu)) {
      suhu = suhu.toFixed(1);
      suhuTerakhir = parseFloat(suhu);
      const tempElem = document.getElementById("realtime-temperature");
      if (tempElem) tempElem.textContent = suhu + " °C";
    }
    hideSuhuTimeoutAlert();
    if (!tuningActive) {
      // Jika tidak dalam mode tuning, set timeout untuk suhu dan tampilkan alert jika tidak ada data suhu dalam waktu tertentu
      if (suhuTimeout) clearTimeout(suhuTimeout);
      suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
    }
  });

  socket.on("force_logout", (data) => {
    // fungsi untuk menerima event force_logout dari server
    showBootstrapAlert(`You has been kickout: ${data.reason}`, 600);
    setTimeout(() => {
      window.location.href = "/";
    }, 1000);
  });
  resetIdleTimer();
}

function showSuhuTimeoutAlert() {
  if (!tuningActive) {
    if (!document.getElementById("suhu-alert")) {
      const alertDiv = document.createElement("div");
      alertDiv.id = "suhu-alert";
      alertDiv.className =
        "alert alert-danger alert-dismissible fade show position-fixed top-0 end-2 m-3 p-auto";
      alertDiv.role = "alert";
      alertDiv.style.zIndex = 1060;
      alertDiv.innerHTML = `
        <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
        ⚠️ Make sure the PID Trainer is connected to Wifi and there is an internet connection!
      `;
      document.body.appendChild(alertDiv);
    }
  }
}

function hideSuhuTimeoutAlert() {
  const alertDiv = document.getElementById("suhu-alert");
  if (alertDiv) {
    alertDiv.classList.remove("show");
    alertDiv.classList.add("hide");
    setTimeout(() => {
      if (alertDiv.parentNode) alertDiv.remove();
    }, 200);
  }
}

function showBootstrapAlert(message, timeout) {
  // Fungsi untuk menampilkan alert Bootstrap dengan progress bar
  alertCounter++;
  const alertId = `bootstrap-alert-${alertCounter}`;
  const progressId = `alert-progress-${alertCounter}`;

  const alertDiv = document.createElement("div");
  alertDiv.id = alertId;
  alertDiv.className =
    "alert custom-alert-green alert-dismissible fade show position-fixed top-0 end-0 m-3 p-auto";
  alertDiv.role = "alert";
  alertDiv.style.zIndex = 1055;
  alertDiv.innerHTML = `
    ${message}
    <div class="progress mt-2" style="height:4px;">
      <div id="${progressId}" class="progress-bar bg-success" role="progressbar" style="width: 100%; transition: width ${timeout}ms linear;"></div>
    </div>
  `;
  document.body.appendChild(alertDiv);

  setTimeout(() => {
    const progressBar = document.getElementById(progressId);
    if (progressBar) progressBar.style.width = "0%";
  }, 10);

  setTimeout(() => {
    alertDiv.classList.remove("show");
    alertDiv.classList.add("hide");
    setTimeout(() => {
      if (alertDiv.parentNode) alertDiv.remove();
    }, 200);
  }, timeout);
}

function showSocketConnectingAlert() {
  const alertId = "socket-connecting-alert";
  let alertDiv = document.getElementById(alertId);
  if (!alertDiv) {
    alertDiv = document.createElement("div");
    alertDiv.id = alertId;
    alertDiv.className =
      "alert alert-danger alert-dismissible fade show position-fixed top-0 end-2 m-3 p-auto";
    alertDiv.role = "alert";
    alertDiv.style.zIndex = 1060;
    alertDiv.innerHTML = `
      <span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ⚠️ Not Connected to Server, Trying to Connect...`;
    document.body.appendChild(alertDiv);
  }
}

function hideSocketConnectingAlert() {
  const alertDiv = document.getElementById("socket-connecting-alert");
  if (alertDiv) {
    alertDiv.classList.remove("show");
    alertDiv.classList.add("hide");
    setTimeout(() => {
      if (alertDiv.parentNode) alertDiv.remove();
    }, 200);
  }
}

function updateStatus() {
  // Fungsi untuk memperbarui status koneksi Socket.IO jika sudah terhubung
  if (!sudahKonek) {
    if (socketAlertTimeout) clearTimeout(socketAlertTimeout);
    socketAlertTimeout = setTimeout(() => {
      if (!sudahKonek) showSocketConnectingAlert();
    }, 500);
  } else {
    if (socketAlertTimeout) clearTimeout(socketAlertTimeout);
    hideSocketConnectingAlert();
    showBootstrapAlert(
      "✅ Login Successful!, Already Connected to Server",
      1500
    );
  }
}

//deklarasi variabel dan tombol
const controlModeSelect = document.getElementById("mode");
const inputFieldsDiv = document.getElementById("input-fields");
const startButton = document.getElementById("start");
const stopButton = document.getElementById("stop");
const clearButton = document.getElementById("clear");
const logoutButton = document.getElementById("logout");

//deklasrasi variabel untuk grafik//
let allData = [];
let waktuSamplingUser = null;
let chart;
let pollingActive = false;

// Fungsi untuk mengambil nilai set point dari input
function getSetPoint() {
  return parseFloat(document.getElementById("sp")?.value) || null;
}
function getTSPH() {
  return parseFloat(document.getElementById("set_point_atas")?.value) || null;
}
function getTSPL() {
  return parseFloat(document.getElementById("set_point_bawah")?.value) || null;
}

// Inisialisasi format data csv untuk ekspor
let csvKp = null;
let csvKi = null;
let csvKd = null;
let currentMode = null;

async function fetchCurrentOutputData() {
  // Fungsi untuk mengambil data output saat ini dari server Socket.IO
  try {
    if (!chart) initializeChart();
    clearChart();
    allData = [];
    const response = await fetch("/main/get-output");
    if (!response.ok) throw new Error("Gagal mengambil data output");
    const data = await response.json();
    data.forEach((row) => {
      // Jika 0 atau null, jadikan null supaya tidak digambar garisnya
      const setPoint =
        row.set_point && row.set_point !== 0 ? row.set_point : null;
      const tspH =
        row.set_point_atas && row.set_point_atas !== 0
          ? row.set_point_atas
          : null;
      const tspL =
        row.set_point_bawah && row.set_point_bawah !== 0
          ? row.set_point_bawah
          : null;
      updateChart(row.time, row.suhu, setPoint, tspH, tspL);
      allData.push({
        Time: row.time,
        SUHU: row.suhu,
        SetPoint: setPoint,
        TSPH: tspH,
        TSPL: tspL,
        Kp: row.kp,
        Ki: row.ki,
        Kd: row.kd,
        mode: row.mode,
      });
    });
    showBootstrapAlert("🔔 Latest tuning output displayed!", 1000);
  } catch (err) {
    showBootstrapAlert(
      "⚠️ Failed to retrieve output data: " + err.message,
      1000
    );
  }
}

async function fetchOldOutputData() {
  // Fungsi untuk mengambil data output satu sesi sebelumnya dari server Socket.IO
  try {
    if (!chart) initializeChart();
    clearChart();
    allData = [];

    const response = await fetch("/main/get-old-output");
    if (!response.ok) throw new Error("Gagal mengambil data output lama");
    const data = await response.json();
    data.forEach((row) => {
      const setPoint =
        row.set_point && row.set_point !== 0 ? row.set_point : null;
      const tspH =
        row.set_point_atas && row.set_point_atas !== 0
          ? row.set_point_atas
          : null;
      const tspL =
        row.set_point_bawah && row.set_point_bawah !== 0
          ? row.set_point_bawah
          : null;

      updateChart(row.time, row.suhu, setPoint, tspH, tspL);
      allData.push({
        Time: row.time,
        SUHU: row.suhu,
        SetPoint: setPoint,
        TSPH: tspH,
        TSPL: tspL,
        Kp: row.kp,
        Ki: row.ki,
        Kd: row.kd,
        mode: row.mode,
      });
    });
    showBootstrapAlert("🔔 Old tuning output displayed!", 1700);
  } catch (err) {
    showBootstrapAlert(
      "⚠️ Failed to retrieve old output data: " + err.message,
      2000
    );
  }
}

function resetListener() {
  // Fungsi untuk mengatur ulang listener pada socket
  socket.off("new_suhu");
  socket.on("new_suhu", function (newData) {
    if (
      newData.time >= 1.0 &&
      (pollingActive ||
        (waktuSamplingUser && newData.time <= waktuSamplingUser))
    ) {
      updateChart(
        newData.time,
        newData.suhu,
        getSetPoint(),
        getTSPH(),
        getTSPL()
      );
      allData.push({
        Time: newData.time,
        SUHU: newData.suhu,
        SetPoint: getSetPoint(),
        TSPH: getTSPH(),
        TSPL: getTSPL(),
        Kp: csvKp,
        Ki: csvKi,
        Kd: csvKd,
        mode: currentMode,
      });
      console.log("Data diterima:", newData.time);
      if (waktuSamplingUser && newData.time >= waktuSamplingUser) {
        pollingActive = false;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  // Fungsi untuk inisialisasi event listener untuk tombol dan elemen lainnya
  const exportCsvBtn = document.getElementById("exportcsv");
  if (exportCsvBtn) {
    exportCsvBtn.replaceWith(exportCsvBtn.cloneNode(true));
    document.getElementById("exportcsv").addEventListener("click", exportToCSV);
  }

  const btnShowCurrent = document.getElementById("btnShowCurrentOutput");
  if (btnShowCurrent)
    btnShowCurrent.addEventListener("click", fetchCurrentOutputData);

  const btnShowOld = document.getElementById("btnShowOldOutput");
  if (btnShowOld) btnShowOld.addEventListener("click", fetchOldOutputData);

  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("overlay");

  document
    .getElementById("toggleSidebar")
    .addEventListener("click", function () {
      sidebar.classList.toggle("open");
      overlay.classList.toggle("show");
    });
  document.getElementById("overlay").addEventListener("click", function () {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });

  overlay.addEventListener("click", function () {
    sidebar.classList.remove("open");
    overlay.classList.remove("show");
  });

  if (!tuningActive) {
    if (suhuTimeout) clearTimeout(suhuTimeout);
    suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
  }

  async function prefillPID() {
    // Fungsi untuk mengisi nilai default pada input PID dari data terakhir
    try {
      const res = await fetch("/main/prefill-variabel");
      if (!res.ok) throw new Error(res.status);
      const obj = await res.json();
      if (obj.kp != null) document.getElementById("kp").value = obj.kp;
      if (obj.ki != null) document.getElementById("ki").value = obj.ki;
      if (obj.kd != null) document.getElementById("kd").value = obj.kd;
      if (obj.set_point != null)
        document.getElementById("sp").value = obj.set_point;
    } catch (e) {
      console.error("Prefill error", e);
    }
  }

  controlModeSelect.addEventListener("change", function () {
    if (this.value === "pid") {
      setTimeout(prefillPID, 0);
    }
  });
  controlModeSelect.addEventListener("change", function () {
    if (this.value === "pid") {
      setTimeout(prefillPID, 0);
    }
  });
});

function addTSPLTSPHValidation() {
  // Fungsi untuk menambahkan validasi pada input TSPL dan TSPH
  const tsplInput = document.getElementById("set_point_bawah");
  const tsphInput = document.getElementById("set_point_atas");
  if (!tsplInput || !tsphInput) return;
  tsplInput.addEventListener("input", function () {
    const tspl = parseFloat(tsplInput.value);
    const tsph = parseFloat(tsphInput.value);
    if (!isNaN(tspl) && !isNaN(tsph) && tspl > tsph) {
      tsplInput.value = tsph;
      alert("⚠️ TSPL cannot be higher than TSPH!");
    }
  });
  tsphInput.addEventListener("input", function () {
    const tspl = parseFloat(tsplInput.value);
    const tsph = parseFloat(tsphInput.value);
    if (!isNaN(tspl) && !isNaN(tsph) && tspl > tsph) {
      tsphInput.value = tspl;
      alert("⚠️ TSPH cannot be lower than TSPL!");
    }
  });
}

controlModeSelect.addEventListener("change", function () {
  // Fungsi untuk mengubah input field sesuai dengan mode kontrol yang dipilih
  inputFieldsDiv.innerHTML = "";

  switch (this.value) {
    case "satuposisi":
      inputFieldsDiv.innerHTML = `
                <div class="container-fluid mx-auto">
                    <label for="sp" class="form-label">Set Point</label>
                    <input type="number" id="sp" placeholder="Enter set point value" class="form-control rounded-1" value="" step="0.1" required>
                </div>`;
      break;
    case "duaposisi":
      inputFieldsDiv.innerHTML = `
                <div class="container-fluid mx-auto">
                    <label for="set_point_atas" class="form-label">Set Point High (°C)</label>
                    <input type="number" id="set_point_atas" placeholder="Enter TSPH value" class="form-control rounded-1" value="" step="0.1" required>
                    <label for="set_point_bawah" class="form-label">Set Point Low (°C)</label>
                    <input type="number" id="set_point_bawah" placeholder="Enter TSPL value" class="form-control rounded-1" value="" step="0.1" required>
                </div>`;
      addTSPLTSPHValidation();
      break;
    case "pid":
      inputFieldsDiv.innerHTML = ` 
                <div class="container-fluid mx-auto">
                    <label for="kp" class="form-label">Kp</label>
                    <input type="number" id="kp" placeholder="Enter kp value" class="form-control rounded-1" value="" step="0.1" list="kp-history" required>
                    <datalist id="kp-history"></datalist>
                    ${
                      this.value === "pd" || this.value === "pid"
                        ? ` 
                        <label for="kd" class="form-label">Kd</label>
                        <input type="number" id="kd" placeholder="Enter kd value" class="form-control rounded-1" value="" step="0.1" list="kd-history" required>
                        <datalist id="kd-history"></datalist>`
                        : ""
                    }
                    ${
                      this.value === "pid"
                        ? `
                        <label for="ki" class="form-label">Ki</label>
                        <input type="number" id="ki" placeholder="Enter ki value" class="form-control rounded-1" value="" step="0.01" list="ki-history" required>
                        <datalist id="ki-history"></datalist>`
                        : ""
                    }
                    <label for="sp" class="form-label">Set Point (°C)</label>
                    <input type="number" id="sp" placeholder="Enter set point value" class="form-control rounded-1" value="" step="0.1" list="sp-history" required>
                    <datalist id="sp-history"></datalist>
                </div>`;
      break;
  }
});

startButton.addEventListener("click", async function (event) {
  // listener tombol start untuk memulai tuning
  event.preventDefault();

  if (suhuTerakhir !== null && suhuTerakhir >= 35.0) {
    const confirmStart = await showConfirmationModal(
      `⚠️ Temperature at this time ${suhuTerakhir}°C, continuing tuning may change the previous results. Continue?`
    );
    if (!confirmStart) {
      showBootstrapAlert(
        "⚠️ Tuning canceled due to unstable temperature!",
        1700
      );
      return;
    }
  }

  tuningActive = true;
  if (suhuTimeout) clearTimeout(suhuTimeout); // Hentikan timeout jika suhu sudah diterima
  if (controlModeSelect.value === "Choice Mode") {
    alert("⚠️ Please select the control mode before starting!");
    return;
  }

  const mode = controlModeSelect.value;
  const time =
    parseFloat(document.getElementById("time_sampling").value) || null;
  const sp = parseFloat(document.getElementById("sp")?.value) || null;
  const tsph =
    parseFloat(document.getElementById("set_point_atas")?.value) || null;
  const tspl =
    parseFloat(document.getElementById("set_point_bawah")?.value) || null;
  const kp = parseFloat(document.getElementById("kp")?.value) || null;
  const ki = parseFloat(document.getElementById("ki")?.value) || null;
  const kd = parseFloat(document.getElementById("kd")?.value) || null;

  currentMode = mode;
  csvKp = kp;
  csvKi = ki;
  csvKd = kd;

  waktuSamplingUser = time;
  const id_tuning = "TUNING_" + Date.now();

  const data = {
    mode: mode,
    time_sampling: time,
    set_point: sp,
    set_point_atas: tsph,
    set_point_bawah: tspl,
    kp: kp,
    ki: ki,
    kd: kd,
    id_tuning: id_tuning,
  };
  console.log(data);

  // Mengirim data ke beckend menggunakan fetch API (POST)
  fetch("main/data", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  })
    .then((response) => {
      if (!response.ok) {
        console.error("Gagal mengirim data ke server:", response.status);
        return response.json().then((err) => {
          throw new Error(err.error || "Gagal mengirim data");
        });
      }

      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return response.json();
      } else {
        return null;
      }
    })
    .then((data) => {
      console.log("Response dari server:", data);
      showBootstrapAlert("✅ Data saved successfully!", 1700);
    })
    .catch((error) => {
      console.error("Error:", error);
      showBootstrapAlert("⚠️ Error saving data!! Please try again.", 1700);
    });

  pollingActive = true;
  if (!chart) {
    initializeChart();
  }
  clearChart();
  allData = [];
  resetListener();
  if (tuningTimeout) clearTimeout(tuningTimeout);
  if (waktuSamplingUser) {
    // Set timeout untuk menghentikan tuning setelah proses selesai
    tuningTimeout = setTimeout(() => {
      tuningActive = false;
      if (suhuTimeout) clearTimeout(suhuTimeout);
      suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
    }, (waktuSamplingUser - 0.1) * 1000); // waktu tuning dikurangi 0.1 detik
  }
});

stopButton.addEventListener("click", function () {
  // listener tombol stop untuk menghentikan tuning
  socket.off("new_suhu");
  console.log("socket terputus");
  pollingActive = false;
  console.log("Kontrol dihentikan");

  fetch("/main/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  })
    .then((res) => console.log("Stop command sent to backend"))
    .catch((err) => console.error("Failed to send stop command", err));
  console.log("Kontrol dihentikan");
  alert("⚠️ Tuning stopped!");

  tuningActive = false;
  if (tuningTimeout) clearTimeout(tuningTimeout);
  if (suhuTimeout) clearTimeout(suhuTimeout);
  suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
});

clearButton.addEventListener("click", function () {
  // listener tombol clear untuk menghapus grafik
  clearChart();
});

function initializeChart() {
  // fungsi untuk inisialisasi grafik menggunakan Chart.js
  const ctx = document.getElementById("realTimeChart").getContext("2d");
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "TA",
          data: [],
          borderColor: "blue",
          fill: false,
          tension: 0.1,
        },
        {
          label: "Set Point",
          data: [],
          borderColor: "red",
          fill: false,
          tension: 0.1,
        },
        {
          label: "TSPH",
          data: [],
          borderColor: "maroon",
          fill: false,
          tension: 0.1,
        },
        {
          label: "TSPL",
          data: [],
          borderColor: "coral",
          fill: false,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      animation: {
        y: {
          duration: 0,
        },
        x: {
          duration: 900,
        },
      },
      plugins: {
        legend: {
          labels: {
            font: {
              weight: "bolder",
            },
            color: "black",
          },
        },
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Duration (second)",
            font: {
              weight: "bolder",
            },
            gapBottom: 10,
          },
        },
        y: {
          title: {
            display: true,
            text: "Temperature Actual (Celcius)",
            font: {
              weight: "bolder",
            },
          },
        },
      },
    },
  });
}

function updateChart(time, suhu, setPoint, tspH, tspL) {
  // fungsi untuk memperbarui grafik dengan data terbaru
  console.log("updateChart:", time, suhu, setPoint, tspH, tspL);
  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(suhu);
  chart.data.datasets[1].data.push(setPoint);
  chart.data.datasets[2].data.push(tspH);
  chart.data.datasets[3].data.push(tspL);
  chart.update();
}

function clearChart() {
  // fungsi untuk menghapus grafik
  allData = [];
  chart.data.labels = [];
  chart.data.datasets[0].data = [];
  chart.data.datasets[1].data = [];
  chart.data.datasets[2].data = [];
  chart.data.datasets[3].data = [];
  chart.update();
  console.log("Grafik dihapus");
}

function exportToCSV() {
  console.log("Jumlah data:", allData.length);
  if (allData.length === 0) return; // Tidak ada data di tampilkan, maka tidak perlu ekspor CSV
  console.log("❗ allData kosong, CSV tidak dibuat.");

  // Kelompokkan data berdasarkan mode kontrol
  const modeGroups = {};
  allData.forEach((row) => {
    const mode = row.mode || "unknown";
    if (!modeGroups[mode]) modeGroups[mode] = [];
    modeGroups[mode].push(row);
  });

  // Ekspor satu file per mode
  Object.entries(modeGroups).forEach(([mode, rows]) => {
    console.log("Export CSV dipanggil");
    let sp = "";
    let csvHeader = "";
    let csvContent = "";
    let pidParams = "";
    // Ambil nilai variabel dari baris pertama untuk nama file
    if (rows.length > 0) {
      if (mode === "satuposisi" || mode === "pid") {
        sp = rows[0].SetPoint ?? "";
      } else if (mode === "duaposisi") {
        sp = `${rows[0].TSPL ?? ""}-${rows[0].TSPH ?? ""}`;
      }
    }
    if (mode === "pid") {
      const kp = rows[0].Kp ?? "";
      const ki = rows[0].Ki ?? "";
      const kd = rows[0].Kd ?? "";
      if (kp !== "" && kp !== null && kp !== undefined) pidParams += `-kp${kp}`;
      if (kd !== "" && kd !== null && kd !== undefined) pidParams += `-kd${kd}`;
      if (ki !== "" && ki !== null && ki !== undefined) pidParams += `-ki${ki}`;
    }

    // Pilihan header dan kolom CSV berdasarkan mode
    if (mode === "satuposisi") {
      csvHeader = "Time (s), Set Point, TA\n";
      rows.forEach((row) => {
        csvContent += `${row.Time}, ${row.SetPoint ?? ""}, ${row.SUHU ?? ""}\n`;
      });
    } else if (mode === "duaposisi") {
      csvHeader = "Time (s), TSPL, TSPH, TA\n";
      rows.forEach((row) => {
        csvContent += `${row.Time}, ${row.TSPL ?? ""}, ${row.TSPH ?? ""}, ${
          row.SUHU ?? ""
        }\n`;
      });
    } else if (mode === "pid") {
      csvHeader = "Time (s), Set Point, TA, Kp, Ki, Kd\n";
      rows.forEach((row) => {
        csvContent += `${row.Time}, ${row.SetPoint ?? ""}, ${row.SUHU ?? ""}, ${
          row.Kp ?? ""
        }, ${row.Ki ?? ""}, ${row.Kd ?? ""}\n`;
      });
    } else {
      // Mode tidak dikenal, gunakan format default
      csvHeader = "Time (s), Set Point, TSPH, TSPL, TA, Kp, Ki, Kd\n";
      rows.forEach((row) => {
        csvContent += `${row.Time}, ${row.SetPoint ?? ""}, ${row.TSPH ?? ""}, ${
          row.TSPL ?? ""
        }, ${row.SUHU ?? ""}, ${row.Kp ?? ""}, ${row.Ki ?? ""}, ${
          row.Kd ?? ""
        }\n`;
      });
    }

    const blob = new Blob([csvHeader + csvContent], {
      // Membuat Blob dari data CSV
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.setAttribute("href", URL.createObjectURL(blob));
    if (mode === "pid") {
      link.setAttribute("download", `data-${sp}-pid${pidParams}.csv`);
    } else {
      link.setAttribute("download", `data-${sp}-${mode}.csv`);
    }
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function showConfirmationModal(message) {
  // Fungsi untuk menampilkan modal konfirmasi sesuai dengan pesan yang diberikan
  return new Promise((resolve) => {
    const modalBackdrop = document.createElement("div");
    modalBackdrop.className = "modal-backdrop fade show";
    modalBackdrop.style.zIndex = 1040;

    const modal = document.createElement("div");
    modal.className = "modal fade show d-block";
    modal.style.backgroundColor = "rgba(0,0,0,0.3)";
    modal.style.zIndex = 1050;
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-danger">
          <div class="modal-header bg-danger text-white">
            <h5 class="modal-title">High Temperature Warning</h5>
          </div>
          <div class="modal-body">
            <p>${message}</p>
          </div>
          <div class="modal-footer">
            <button id="btnAllow" class="btn btn-success">Allow</button>
            <button id="btnDenied" class="btn btn-secondary">Denied</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);
    document.body.appendChild(modal);

    document.getElementById("btnAllow").addEventListener("click", () => {
      modalBackdrop.remove();
      modal.remove();
      resolve(true);
    });
    document.getElementById("btnDenied").addEventListener("click", () => {
      modalBackdrop.remove();
      modal.remove();
      resolve(false);
    });
  });
}

window.addEventListener("pagehide", function () {
  // Event listener untuk menangani pagehide atau ketika halaman ditutup
  navigator.sendBeacon("/logout");
  try {
    socket.disconnect();
  } catch (e) {}
});

setInterval(() => {
  // Mengirim heartbeat setiap 1 detik untuk menjaga session tetap aktif
  fetch("/main/heartbeat", { method: "POST" });
}, 1000);

let idleTimeout = null;
const AUTO_LOGOUT_TIME = 15 * 60 * 1000; // 15 menit

function resetIdleTimer() {
  // Fungsi untuk mereset timer idle
  if (idleTimeout) clearTimeout(idleTimeout);
  idleTimeout = setTimeout(autoLogout, AUTO_LOGOUT_TIME);
}

function autoLogout() {
  // Fungsi untuk melakukan logout otomatis setelah waktu idle habis
  showBootstrapAlert("Session expired due to inactivity. Logging out...", 1700);
  setTimeout(async () => {
    await socket.disconnect();
    await fetch("/logout", { method: "POST", credentials: "include" });
    console.log("POST /logout dipanggil");
    window.location.href = "/";
  }, 2000);
}
[
  "mousemove",
  "keydown",
  "mousedown",
  "touchstart",
  "touchmove",
  "scroll",
].forEach((evt) => {
  document.addEventListener(evt, resetIdleTimer, true);
});
resetIdleTimer();

logoutButton.addEventListener("click", async () => {
  // Listener tombol logout untuk mengakhiri sesi
  await socket.disconnect();
  console.log("socket terputus");
  const response = await fetch("/logout", {
    method: "POST",
    credentials: "include",
  });
  if (response.redirected) {
    window.location.href = response.url;
  }
});

document.addEventListener("visibilitychange", async function () {
  // listener untuk menangani perubahan visibilitas halaman
  if (document.visibilityState === "visible") {
    const res = await fetch("/main/heartbeat", { method: "POST" });
    if (res.status === 401 || res.redirected) {
      // Jika session sudah tidak valid, redirect ke halaman login
      window.location.href = "/";
    }
  }
});
