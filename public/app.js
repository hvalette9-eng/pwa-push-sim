const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function getVal(id) {
  const el = document.getElementById(id);
  return el ? el.value : "";
}

function num(id, fallback) {
  const v = Number(getVal(id));
  return Number.isFinite(v) ? v : fallback;
}

function saveConfig(cfg) {
  localStorage.setItem("notifSimConfig", JSON.stringify(cfg));
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem("notifSimConfig") || "{}");
  } catch {
    return {};
  }
}

function applyConfigToForm(cfg) {
  const map = [
    ["shopName", "Ma Marque"],
    ["count", 5],
    ["minSec", 2],
    ["maxSec", 6],
    ["orderStart", 1042],
    ["priceMin", 20],
    ["priceMax", 80],
    ["lang", "fr"],
    ["mode", "random"],
  ];

  for (const [id, def] of map) {
    const el = document.getElementById(id);
    if (!el) continue;
    const v = cfg[id];
    el.value = (v === undefined || v === null || v === "") ? def : v;
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function ensurePushSubscription() {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker non supporté");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Permission refusée");

  const reg = await navigator.serviceWorker.register("/sw.js");

  const { key } = await (await fetch("/api/vapidPublicKey")).json();

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }

  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
}

function readConfigFromForm() {
  const cfg = {
    shopName: String(getVal("shopName") || "Ma Marque").trim(),
    count: Math.max(1, Math.floor(num("count", 5))),
    minSec: Math.max(0.1, num("minSec", 2)),
    maxSec: Math.max(0.1, num("maxSec", 6)),
    orderStart: Math.max(1, Math.floor(num("orderStart", 1042))),
    priceMin: Math.max(0, num("priceMin", 20)),
    priceMax: Math.max(0, num("priceMax", 80)),
    lang: String(getVal("lang") || "fr"),
    mode: String(getVal("mode") || "random"),
  };

  if (cfg.maxSec < cfg.minSec) {
    const tmp = cfg.maxSec;
    cfg.maxSec = cfg.minSec;
    cfg.minSec = tmp;
  }

  if (cfg.priceMax < cfg.priceMin) {
    const tmp = cfg.priceMax;
    cfg.priceMax = cfg.priceMin;
    cfg.priceMin = tmp;
  }

  return cfg;
}

// Init: restore saved config
applyConfigToForm(loadConfig());

async function start() {
  const cfg = readConfigFromForm();
  saveConfig(cfg);

  setStatus("Activation des notifications…");
  await ensurePushSubscription();

  setStatus("Démarrage de la simulation…");
  await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cfg),
  });

  setStatus("✅ Simulation lancée (garde l’app ouverte).");
}

async function stop() {
  await fetch("/api/stop", { method: "POST" });
  setStatus("⏹️ Stop.");
}

document.getElementById("btnStart").onclick = () =>
  start().catch(e => setStatus("❌ " + (e?.message || String(e))));

document.getElementById("btnStop").onclick = () =>
  stop().catch(e => setStatus("❌ " + (e?.message || String(e))));
