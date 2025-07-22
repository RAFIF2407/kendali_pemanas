//koneksi ke server socket.io//
var socket = io("https://pid-trainer.up.railway.app/", {
  query: { nim: String(window.myNim).trim() },
});

let sudahKonek = false;
let socketAlertTimeout = null;
let alertCounter = 0;
let suhuTimeout = null;
const SUHU_TIMEOUT_MS = 5000; // 5 detik
let tuningActive = false;
let tuningTimeout = null;

function showSuhuTimeoutAlert() {
  if (!tuningActive) {
    // Cek jika alert sudah ada, jangan buat dobel
    if (!document.getElementById("suhu-alert")) {
      const alertDiv = document.createElement("div");
      alertDiv.id = "suhu-alert";
      alertDiv.className =
        "alert alert-danger alert-dismissible fade show position-fixed top-0 end-0 m-3 p-auto";
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

// Hilangkan alert jika data suhu sudah diterima lagi
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

// Fungsi khusus untuk alert koneksi socket dengan spinner
function showSocketConnectingAlert() {
  const alertId = "socket-connecting-alert";
  let alertDiv = document.getElementById(alertId);
  if (!alertDiv) {
    alertDiv = document.createElement("div");
    alertDiv.id = alertId;
    alertDiv.className =
      "alert alert-danger alert-dismissible fade show position-fixed top-0 end-0 m-3 p-auto";
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

updateStatus();

socket.on("connect", () => {
  sudahKonek = true;
  updateStatus();
  console.log("Terhubung ke server Socket.IO, id:", socket.id);
});

socket.on("disconnect", () => {
  sudahKonek = false;
  updateStatus();
  console.log("Terputus dari server Socket.IO");
});

let suhuTerakhir = null;

socket.on("mqtt-temperature", function (data) {
  let suhu = parseFloat(data.suhu);
  if (!isNaN(suhu)) {
    suhu = suhu.toFixed(1);
    suhuTerakhir = parseFloat(suhu);
    const tempElem = document.getElementById("realtime-temperature");
    if (tempElem) tempElem.textContent = suhu + " °C";
  }
  // Hilangkan alert jika ada data suhu
  hideSuhuTimeoutAlert();
  // Reset timer hanya jika tuning tidak aktif
  if (!tuningActive) {
    if (suhuTimeout) clearTimeout(suhuTimeout);
    suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
  }
});

//deklarasi variabel dan tombol//
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

// Fungsi untuk mengambil data set point suhu dari server Socket.IO//
function getSetPoint() {
  return parseFloat(document.getElementById("sp")?.value) || null;
}
function getTSPH() {
  return parseFloat(document.getElementById("set_point_atas")?.value) || null;
}
function getTSPL() {
  return parseFloat(document.getElementById("set_point_bawah")?.value) || null;
}

let csvKp = null;
let csvKi = null;
let csvKd = null;
let currentMode = null;

// Fungsi untuk mengambil data output terbaru dari server Socket.IO//
async function fetchCurrentOutputData() {
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
        Kp: row.kp, // tambahkan
        Ki: row.ki, // tambahkan
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

// Fungsi untuk mengambil data output lama dari server Socket.IO//
async function fetchOldOutputData() {
  try {
    if (!chart) initializeChart();
    clearChart();
    allData = [];

    const response = await fetch("/main/get-old-output");
    if (!response.ok) throw new Error("Gagal mengambil data output lama");
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
        Kp: row.kp, // tambahkan
        Ki: row.ki, // tambahkan
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

// fungsi untuk menghapus nilai pada grafik//
function resetListener() {
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
        // socket.off("new_suhu");
      }
    }
  });
}

// --- Event Handler DOM--- //
document.addEventListener("DOMContentLoaded", function () {
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

// Setelah elemen input dibuat (misal setelah controlModeSelect change)
function addTSPLTSPHValidation() {
  const tsplInput = document.getElementById("set_point_bawah");
  const tsphInput = document.getElementById("set_point_atas");
  if (!tsplInput || !tsphInput) return;

  // Saat TSPL diubah
  tsplInput.addEventListener("input", function () {
    const tspl = parseFloat(tsplInput.value);
    const tsph = parseFloat(tsphInput.value);
    if (!isNaN(tspl) && !isNaN(tsph) && tspl > tsph) {
      tsplInput.value = tsph; // Set TSPL sama dengan TSPH jika lebih besar
      alert("⚠️ TSPL cannot be higher than TSPH!");
    }
  });

  // Saat TSPH diubah
  tsphInput.addEventListener("input", function () {
    const tspl = parseFloat(tsplInput.value);
    const tsph = parseFloat(tsphInput.value);
    if (!isNaN(tspl) && !isNaN(tsph) && tspl > tsph) {
      tsphInput.value = tspl; // Set TSPH sama dengan TSPL jika lebih kecil
      alert("⚠️ TSPH cannot be lower than TSPL!");
    }
  });
}

// memilih mode kontrol kendali//
controlModeSelect.addEventListener("change", function () {
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
                    <label for="set_point_atas" class="form-label">Set Point High</label>
                    <input type="number" id="set_point_atas" placeholder="Enter TSPH value" class="form-control rounded-1" value="" step="0.1" required>
                    <label for="set_point_bawah" class="form-label">Set Point Low</label>
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
                    <label for="sp" class="form-label">Set Point</label>
                    <input type="number" id="sp" placeholder="Enter set point value" class="form-control rounded-1" value="" step="0.1" list="sp-history" required>
                    <datalist id="sp-history"></datalist>
                </div>`;
      break;
  }
});

// listener tombol start//
startButton.addEventListener("click", async function (event) {
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
  if (suhuTimeout) clearTimeout(suhuTimeout); // matikan timer suhu

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

  // Mengirim data ke beckend menggunakan fetch API (POST) //
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
  // Set timer tuning selesai otomatis
  if (tuningTimeout) clearTimeout(tuningTimeout);
  if (waktuSamplingUser) {
    tuningTimeout = setTimeout(() => {
      tuningActive = false;
      // Aktifkan kembali timer suhu
      if (suhuTimeout) clearTimeout(suhuTimeout);
      suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
    }, (waktuSamplingUser - 0.1) * 1000); // waktu tuning dikurangi 0.1 detik
  }
});

// listener tombol stop//
stopButton.addEventListener("click", function () {
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
  // Aktifkan kembali timer suhu
  if (suhuTimeout) clearTimeout(suhuTimeout);
  suhuTimeout = setTimeout(showSuhuTimeoutAlert, SUHU_TIMEOUT_MS);
});

// listener tombol clear//
clearButton.addEventListener("click", function () {
  clearChart();
});

//fungsi inisialisasi grafik//
function initializeChart() {
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
              weight: "bolder", // <-- label legend lebih tebal
            },
            color: "black", // <-- label legend berwarna hitam
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

//fungsi update grafik//
function updateChart(time, suhu, setPoint, tspH, tspL) {
  console.log("updateChart:", time, suhu, setPoint, tspH, tspL);
  chart.data.labels.push(time);
  chart.data.datasets[0].data.push(suhu);
  chart.data.datasets[1].data.push(setPoint);
  chart.data.datasets[2].data.push(tspH);
  chart.data.datasets[3].data.push(tspL);
  chart.update();
}

//fungsi hapus grafik//
function clearChart() {
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
  if (allData.length === 0) return; // Tidak ada data untuk diekspor, kembalikan awal fungsi tanpa ekspor CSV atau alert //
  console.log("❗ allData kosong, CSV tidak dibuat.");

  // Kelompokkan data berdasarkan mode yang benar
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
    // Ambil nilai sp dari baris pertama (jika ada)
    if (rows.length > 0) {
      if (mode === "satuposisi" || mode === "pid") {
        sp = rows[0].SetPoint ?? "";
      } else if (mode === "duaposisi") {
        sp = `${rows[0].TSPL ?? ""}-${rows[0].TSPH ?? ""}`;
      }
    }

    if (mode === "pid") {
      // Ambil nilai Kp, Ki, Kd dari baris pertama
      const kp = rows[0].Kp ?? "";
      const ki = rows[0].Ki ?? "";
      const kd = rows[0].Kd ?? "";
      // Susun string parameter sesuai yang diisi
      if (kp !== "" && kp !== null && kp !== undefined) pidParams += `-kp${kp}`;
      if (kd !== "" && kd !== null && kd !== undefined) pidParams += `-kd${kd}`;
      if (ki !== "" && ki !== null && ki !== undefined) pidParams += `-ki${ki}`;
    }

    // Pilihan header dan kolom per mode
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
      // Default: ekspor semua kolom (fallback)
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
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    // const url = URL.createObjectURL(blob);
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

// Auto logout saat tab/browser ditutup (desktop & mobile)
window.addEventListener("pagehide", function () {
  // Pastikan logout ke server tetap dikirim walau tab ditutup
  navigator.sendBeacon("/logout");
  // Optional: disconnect socket (tidak wajib, karena tab akan tertutup)
  try {
    socket.disconnect();
  } catch (e) {}
});

// setInterval untuk mengirim heartbeat setiap 60 detik//
setInterval(() => {
  fetch("/main/heartbeat", { method: "POST" });
}, 5000); // 5 detik

let idleTimeout = null;
const AUTO_LOGOUT_TIME = 15 * 60 * 1000; // 15 menit

function resetIdleTimer() {
  if (idleTimeout) clearTimeout(idleTimeout);
  idleTimeout = setTimeout(autoLogout, AUTO_LOGOUT_TIME);
}

function autoLogout() {
  showBootstrapAlert("Session expired due to inactivity. Logging out...", 1700);
  setTimeout(async () => {
    await socket.disconnect();
    await fetch("/logout", { method: "POST", credentials: "include" });
    console.log("POST /logout dipanggil");
    window.location.href = "/";
  }, 2000);
}

// Pantau aktivitas user
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

//listener tombol logout//
logoutButton.addEventListener("click", async () => {
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

// Cek session ke server saat tab kembali aktif (misal setelah freeze di mobile)
document.addEventListener("visibilitychange", async function () {
  if (document.visibilityState === "visible") {
    // Cek session ke server
    const res = await fetch("/main/heartbeat", { method: "POST" });
    if (res.status === 401 || res.redirected) {
      // Jika session expired, redirect ke login
      window.location.href = "/";
    }
  }
});
