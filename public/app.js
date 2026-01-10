// public/app.js

const statusEl = document.getElementById("status");

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg;
}

// ---------- Utils ----------
function $(id) {
  return document.getElementById(id);
}

function num(id, def) {
  const v = Number($(id)?.value);
  return Number.isFinite(v) ? v : def;
}

function str(id, def = "") {
  const v = $(id)?.value;
  return (v === undefined || v === null || v === "") ? def : String(v);
}

// ---------- Local storage ----------
function saveConfig(cfg) {
  localStorage.setItem("notifSimCfg", JSON.stringify(cfg));
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem("notifSimCfg") || "{}");
  } catch {
    return {};
  }
}

function applyConfig(cfg) {
  const map = [
    ["shopName", "Ma Marque"],
    ["count", 5],
    ["minSec", 2],
    ["maxSec", 6],
    ["orderStart", 1042],
    ["priceMin", 20],
    ["priceMax", 80],
    ["lang", "fr"],
    ["mode", "random"]
  ];

  map.forEach(([id, def]) => {
    const el = $(id);
    if (!el) return;
    el.value = (cfg[id] !== undefined) ? cfg[id] : def;
  });
}

// ---------- Push helpers ----------
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(ch => ch.charCodeAt(0)));
}

async function ensureSubscription() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker non supporté");
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("Notifications refusées");
  }

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

// ---------- Logo upload ----------
async function uploadLogoIfAny() {
  const input = $("logoFile");
  const file = input?.files?.[0];
  if (!file) return null;

  const fd = new FormData();
  fd.append("logo", file);

  const res = await fetch("/api/logo", {
    method: "POST",
    body: fd
  });

  if (!res.ok) {
    throw new Error("Upload du logo impossible");
  }

  const json = await res.json();
  return json.url; // ex: /user-logo.png
}

// ---------- Start / Stop ----------
function readConfig() {
  let cfg = {
    shopName: str("shopName", "Ma Marque").trim(),
    count: Math.max(1, Math.floor(num("count", 5))),
    minSec: Math.max(0.1, num("minSec", 2)),
    maxSec: Math.max(0.1, num("maxSec", 6)),
    orderStart: Math.max(1, Math.floor(num("orderStart", 1042))),
    priceMin: Math.max(0, num("priceMin", 20)),
    priceMax: Math.max(0, num("priceMax", 80)),
    lang: str("lang", "fr"),
    mode: str("mode", "random")
  };

  if (cfg.maxSec < cfg.minSec) {
    const t = cfg.maxSec;
    cfg.maxSec = cfg.minSec;
    cfg.minSec = t;
  }

  if (cfg.priceMax < cfg.priceMin) {
    const t = cfg.priceMax;
    cfg.priceMax = cfg.priceMin;
    cfg.priceMin = t;
  }

  return cfg;
}

async function start() {
  try {
    const cfg = readConfig();
    saveConfig(cfg);

    setStatus("Activation des notifications…");
    await ensureSubscription();

    const logoUrl = await uploadLogoIfAny();
    if (logoUrl) cfg.iconUrl = logoUrl;

    setStatus("Démarrage de la simulation…");
    await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cfg),
    });

    setStatus("✅ Simulation lancée");
  } catch (e) {
    setStatus("❌ " + (e?.message || String(e)));
  }
}

async function stop() {
  await fetch("/api/stop", { method: "POST" });
  setStatus("⏹️ Simulation stoppée");
}

// ---------- Init ----------
applyConfig(loadConfig());

$("btnStart")?.addEventListener("click", start);
$("btnStop")?.addEventListener("click", stop);
