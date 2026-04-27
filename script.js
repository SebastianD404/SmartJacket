const state = {
  mode: "auto",
  bodyTemp: 36.5,
  battery: 21,
  powerUsage: 8.8,
  highThreshold: 38.0,
  lowThreshold: 35.0,
  batteryThreshold: 20,
  pushEnabled: true,
  soundEnabled: false,
  backendConnected: false,
  backendError: null,
  alerts: [
    { type: "success", label: "SUCCESS", time: "2 min ago", text: "Jacket connected successfully" },
    { type: "info", label: "INFO", time: "5 min ago", text: "Auto mode activated - system monitoring your temperature" },
    { type: "success", label: "SUCCESS", time: "15 min ago", text: "Optimal temperature reached (36.8\u00B0C)" },
    { type: "info", label: "INFO", time: "1 hour ago", text: "Firmware update available (v1.3.0)" }
  ],
  trendLabels: ["06:00", "06:05", "06:10", "06:15", "06:20", "06:25", "06:30", "06:35", "06:40", "06:45"],
  bodySeries: [36.5, 36.7, 36.6, 36.7, 36.5, 36.6, 36.8, 36.7, 36.6, 36.5],
  lastSyncMs: Date.now()
};

const el = {
  overviewCard: document.getElementById("overviewCard"),
  stateIcon: document.getElementById("stateIcon"),
  overviewTitle: document.getElementById("overviewTitle"),
  overviewBodyTemp: document.getElementById("overviewBodyTemp"),
  overviewBattery: document.getElementById("overviewBattery"),
  overviewMode: document.getElementById("overviewMode"),
  bodyTemp: document.getElementById("bodyTemp"),
  bodyCondition: document.getElementById("bodyCondition"),
  powerUsage: document.getElementById("powerUsage"),
  batteryPercent: document.getElementById("batteryPercent"),
  batteryBar: document.getElementById("batteryBar"),
  batteryEta: document.getElementById("batteryEta"),
  modeGrid: document.getElementById("modeGrid"),
  modeCaption: document.getElementById("modeCaption"),
  alertsList: document.getElementById("alertsList"),
  notificationList: document.getElementById("notificationList"),
  notificationCount: document.getElementById("notificationCount"),
  drawerCount: document.getElementById("drawerCount"),
  clearAlerts: document.getElementById("clearAlerts"),
  networkText: document.getElementById("networkText"),
  lastSyncText: document.getElementById("lastSyncText"),
  lastUpdated: document.getElementById("lastUpdated"),
  settingsLastSync: document.getElementById("settingsLastSync"),
  notificationDrawer: document.getElementById("notificationDrawer"),
  settingsDrawer: document.getElementById("settingsDrawer"),
  overlay: document.getElementById("overlay"),
  notificationButton: document.getElementById("notificationButton"),
  settingsButton: document.getElementById("settingsButton"),
  closeNotificationDrawer: document.getElementById("closeNotificationDrawer"),
  closeSettingsDrawer: document.getElementById("closeSettingsDrawer"),
  pushToggle: document.getElementById("pushToggle"),
  soundToggle: document.getElementById("soundToggle"),
  highTempSlider: document.getElementById("highTempSlider"),
  lowTempSlider: document.getElementById("lowTempSlider"),
  batteryAlertSlider: document.getElementById("batteryAlertSlider"),
  highTempValue: document.getElementById("highTempValue"),
  lowTempValue: document.getElementById("lowTempValue"),
  batteryAlertValue: document.getElementById("batteryAlertValue")
};

let chart;
const LIVE_API = 'http://localhost:3000/api/data/live';
const HISTORY_API = 'http://localhost:3000/api/data/history';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function titleCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function randomDelta(range = 0.3) {
  return (Math.random() * 2 - 1) * range;
}

function computeStatus() {
  if (state.bodyTemp >= state.highThreshold) {
    return { mode: "alert", title: "Temperature Alert", icon: "triangle-alert", condition: "Too hot" };
  }

  if (state.bodyTemp <= state.lowThreshold) {
    return { mode: "alert", title: "Low Temperature Alert", icon: "triangle-alert", condition: "Too cold" };
  }

  if (state.battery <= state.batteryThreshold) {
    return { mode: "alert", title: "Low Battery", icon: "triangle-alert", condition: "Energy saver mode" };
  }

  return { mode: "normal", title: "All Systems Normal", icon: "circle-check", condition: "Normal" };
}

function parseBackendMode(status) {
  if (!status) {
    return state.mode;
  }

  const normalized = String(status).toLowerCase();
  if (normalized.includes("cool")) return "cool";
  if (normalized.includes("heat")) return "heat";
  if (normalized.includes("off")) return "off";
  return "auto";
}

function updateSensorData(data) {
  if (!data || data.temperature == null) {
    return;
  }

  state.backendConnected = data.connected !== false;
  state.backendError = data.error || null;
  state.bodyTemp = Number(data.temperature);
  state.battery = data.battery != null ? Number(data.battery) : state.battery;
  state.powerUsage = data.powerUsage != null ? Number(data.powerUsage) : state.powerUsage;
  state.mode = parseBackendMode(data.status);
  state.lastSyncMs = Date.now();

  const now = new Date();
  const label = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  pushSeries(label, state.bodyTemp);
}

async function getSmartJacketHistory() {
  try {
    const response = await fetch(`${HISTORY_API}?limit=12`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const rows = await response.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return;
    }

    const labels = rows.map((row) => {
      const date = new Date(row.timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    state.trendLabels = labels;
    state.bodySeries = rows.map((row) => Number(row.temperature.toFixed(1)));

    syncChart();
  } catch (error) {
    console.warn('Unable to load history:', error.message);
  }
}

async function getSmartJacketData() {
  try {
    const response = await fetch(LIVE_API);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    updateSensorData(data);
    renderAll();
    syncChart();
  } catch (error) {
    state.backendConnected = false;
    state.backendError = error.message;
  }
}

function estimateBatteryEta(percent) {
  const minutes = Math.round(percent * 5.5);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hrs ${m.toString().padStart(2, "0")} min`;
}

function renderOverview() {
  const status = computeStatus();

  el.overviewCard.classList.toggle("is-alert", status.mode === "alert");
  el.overviewCard.classList.toggle("is-normal", status.mode === "normal");
  el.overviewTitle.textContent = status.title;
  el.stateIcon.innerHTML = `<i data-lucide="${status.icon}" class="state-icon-svg"></i>`;

  el.overviewBodyTemp.innerHTML = `${state.bodyTemp.toFixed(1)}&deg;C`;
  el.overviewBattery.textContent = `${Math.round(state.battery)}%`;
  el.overviewMode.textContent = titleCase(state.mode);

  el.bodyCondition.textContent = status.condition;
}

function renderVitals() {
  el.bodyTemp.textContent = state.bodyTemp.toFixed(1);
  el.powerUsage.textContent = state.powerUsage.toFixed(1);

  el.batteryPercent.textContent = `${Math.round(state.battery)}`;
  el.batteryBar.style.width = `${clamp(state.battery, 0, 100)}%`;
  el.batteryEta.textContent = estimateBatteryEta(state.battery);
}

function renderMode() {
  const buttons = el.modeGrid.querySelectorAll(".mode-btn");
  buttons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === state.mode);
  });

  const descriptions = {
    auto: "System automatically adjusts based on body temperature.",
    cool: "Cooling module prioritizes heat reduction.",
    heat: "Heating pads maintain warmth in cold conditions.",
    off: "Temperature modules are idle. Monitoring remains active."
  };

  el.modeCaption.innerHTML = `Current mode: <strong>${state.mode.toUpperCase()}</strong><br>${descriptions[state.mode]}`;
}

function renderAlerts() {
  const count = state.alerts.length;
  el.notificationCount.textContent = `${count}`;
  el.drawerCount.textContent = `${count}`;

  const html = state.alerts
    .map((alert) => {
      return `
      <article class="alert-item ${alert.type}">
        <div class="alert-meta">
          <span class="alert-type">${alert.label}</span>
          <span>${alert.time}</span>
        </div>
        <p class="alert-text">${alert.text}</p>
      </article>`;
    })
    .join("");

  const fallback = `
    <article class="alert-item info">
      <div class="alert-meta"><span class="alert-type">INFO</span><span>now</span></div>
      <p class="alert-text">No active alerts.</p>
    </article>`;

  el.alertsList.innerHTML = html || fallback;
  el.notificationList.innerHTML = html || fallback;
  renderIcons();
}

function renderIcons() {
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

function renderSyncTime() {
  const now = new Date();
  const elapsedSec = Math.max(0, Math.floor((Date.now() - state.lastSyncMs) / 1000));

  el.lastSyncText.textContent = `${elapsedSec}s ago`;
  el.lastUpdated.textContent = now.toLocaleTimeString();
  el.settingsLastSync.textContent = now.toLocaleTimeString();

  if (!state.backendConnected) {
    el.networkText.textContent = "Offline";
    return;
  }

  if (elapsedSec <= 4) {
    el.networkText.textContent = "Excellent";
  } else if (elapsedSec <= 9) {
    el.networkText.textContent = "Good";
  } else {
    el.networkText.textContent = "Weak";
  }
}

function openDrawer(drawer) {
  drawer.classList.add("open");
  drawer.setAttribute("aria-hidden", "false");
  el.overlay.hidden = false;
}

function closeDrawers() {
  el.notificationDrawer.classList.remove("open");
  el.notificationDrawer.setAttribute("aria-hidden", "true");
  el.settingsDrawer.classList.remove("open");
  el.settingsDrawer.setAttribute("aria-hidden", "true");
  el.overlay.hidden = true;
}

function setupChart() {
  const ctx = document.getElementById("tempChart");

  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels: state.trendLabels,
      datasets: [
        {
          label: "Body Temp",
          data: state.bodySeries,
          borderColor: "#ff4a65",
          backgroundColor: "transparent",
          tension: 0.35,
          pointRadius: 2
        }
      ]
    },
    options: {
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      scales: {
        y: {
          suggestedMin: 20,
          suggestedMax: 40,
          ticks: {
            callback(value) {
              return `${value}\u00B0C`;
            }
          }
        }
      }
    }
  });
}

function pushSeries(label, b) {
  state.trendLabels.push(label);
  state.bodySeries.push(Number(b.toFixed(1)));

  if (state.trendLabels.length > 12) {
    state.trendLabels.shift();
    state.bodySeries.shift();
  }
}

function syncChart() {
  if (!chart) {
    return;
  }

  chart.data.labels = state.trendLabels;
  chart.data.datasets[0].data = state.bodySeries;
  chart.update();
}

function addAlert(type, label, text) {
  state.alerts.unshift({ type, label, time: "just now", text });
  state.alerts = state.alerts.slice(0, 6);
  renderAlerts();
}

function simulateTick() {
  if (state.mode === "off") {
    state.bodyTemp = clamp(state.bodyTemp + randomDelta(0.2), 34.0, 39.5);
    state.powerUsage = 1.1;
  } else if (state.mode === "cool") {
    state.bodyTemp = clamp(state.bodyTemp - Math.abs(randomDelta(0.22)), 34.0, 39.5);
    state.powerUsage = clamp(9 + randomDelta(0.9), 6, 12);
  } else if (state.mode === "heat") {
    state.bodyTemp = clamp(state.bodyTemp + Math.abs(randomDelta(0.2)), 34.0, 39.5);
    state.powerUsage = clamp(10 + randomDelta(1.1), 6, 14);
  } else {
    if (state.bodyTemp > 36.8) {
      state.bodyTemp = clamp(state.bodyTemp - Math.abs(randomDelta(0.18)), 34.0, 39.5);
    } else if (state.bodyTemp < 36.2) {
      state.bodyTemp = clamp(state.bodyTemp + Math.abs(randomDelta(0.18)), 34.0, 39.5);
    } else {
      state.bodyTemp = clamp(state.bodyTemp + randomDelta(0.07), 34.0, 39.5);
    }
    state.powerUsage = clamp(8 + randomDelta(0.8), 4, 12);
  }

  state.battery = clamp(state.battery - 0.18, 0, 100);
  state.lastSyncMs = Date.now();

  const now = new Date();
  const stamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  pushSeries(stamp, state.bodyTemp);

  const status = computeStatus();
  if (status.mode === "alert" && state.pushEnabled) {
    if (status.title === "Temperature Alert") {
      addAlert("info", "INFO", `Body temperature reached ${state.bodyTemp.toFixed(1)}\u00B0C`);
    }
    if (status.title === "Low Battery") {
      addAlert("info", "INFO", `Battery dropped to ${Math.round(state.battery)}%`);
    }
  }

  renderAll();
  syncChart();
}

function renderAll() {
  renderOverview();
  renderVitals();
  renderMode();
  renderAlerts();
  renderSyncTime();
}

function bindEvents() {
  el.modeGrid.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) {
      return;
    }

    state.mode = button.dataset.mode;
    addAlert("info", "INFO", `${titleCase(state.mode)} mode activated`);
    renderMode();
    renderOverview();
    renderVitals();
  });

  el.notificationButton.addEventListener("click", () => openDrawer(el.notificationDrawer));
  el.settingsButton.addEventListener("click", () => openDrawer(el.settingsDrawer));
  el.closeNotificationDrawer.addEventListener("click", closeDrawers);
  el.closeSettingsDrawer.addEventListener("click", closeDrawers);
  el.overlay.addEventListener("click", closeDrawers);

  el.clearAlerts.addEventListener("click", () => {
    state.alerts = [];
    renderAlerts();
  });

  el.pushToggle.addEventListener("change", () => {
    state.pushEnabled = el.pushToggle.checked;
  });

  el.soundToggle.addEventListener("change", () => {
    state.soundEnabled = el.soundToggle.checked;
  });

  el.highTempSlider.addEventListener("input", () => {
    state.highThreshold = Number(el.highTempSlider.value);
    el.highTempValue.textContent = state.highThreshold.toFixed(1);
    renderOverview();
  });

  el.lowTempSlider.addEventListener("input", () => {
    state.lowThreshold = Number(el.lowTempSlider.value);
    el.lowTempValue.textContent = state.lowThreshold.toFixed(1);
    renderOverview();
  });

  el.batteryAlertSlider.addEventListener("input", () => {
    state.batteryThreshold = Number(el.batteryAlertSlider.value);
    el.batteryAlertValue.textContent = `${state.batteryThreshold}`;
    renderOverview();
  });

  document.querySelectorAll(".theme-btn").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".theme-btn").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
    });
  });
}

function init() {
  bindEvents();
  setupChart();
  renderAll();
  renderIcons();

  getSmartJacketHistory().then(() => {
    getSmartJacketData();
  });

  setInterval(() => {
    getSmartJacketData();
  }, 1000);

  setInterval(() => {
    if (!state.backendConnected) {
      simulateTick();
    }
  }, 5000);

  setInterval(() => {
    renderSyncTime();
  }, 1000);
}

init();
