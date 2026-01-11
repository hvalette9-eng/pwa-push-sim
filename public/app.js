// public/app.js
// Version Safari iOS SAFE – DO NOT EDIT

const $ = (id) => document.getElementById(id);

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
  console.log(msg);
}

/* =========================
   Base64URL -> Uint8Array
========================= */
function base64UrlToUint8Array(base64Url) {
  if (!base64Url) throw new Error("Empty VAPID key");

  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

/* =========================
   Fetch VAPID public key
========================= */
async function fetchVapidPublicKey() {
  const r = await fetch("/api/vapidPublicKey", { cache: "no-store" });
  if (!r.ok) throw new Error("Cannot load /api/vapidPublicKey");
  const j = await r.json().catch(() => ({}));
  const key = (j.publicKey || "").trim();
  if (!key) throw new Error("VAPID public key missing on server");
  return key;
}

/* =========================
   Service Worker (iOS safe)
========================= */
async function getReadyServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker not supported");
  }

  const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });

  // Force update (Safari cache hell)
  try { await reg.update(); } catch (_) {}

  const readyReg = await navigator.serviceWorker.ready;
  return readyReg;
}

/* =========================
   Push subscribe (iOS strict)
========================= */
async function subscribePush(reg, vapidPublicKey) {
  if (!("PushManager" in window)) {
    throw new Error("PushManager unavailable");
  }

  if (Notification.permission === "denied") {
    throw new Error("Notifications blocked in iOS settings");
  }

  if (Notification.permission !== "granted") {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      throw new Error("Notification permission not granted");
    }
  }

  // Always unsubscribe first (iOS bug workaround)
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    try { await existing.unsubscribe(); } catch (_) {}
  }

  const applicationServerKey = base64UrlToUint8Array(vapidPublicKey);

  // 🔥 THIS IS THE CRITICAL LINE FOR SAFARI iOS 🔥
  const subscription = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey
  });

  return subscription;
}

/* =========================
   Send subscription to server
========================= */
async function saveSubscription(sub) {
  const r = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub)
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("Server refused subscription: " + t);
  }

  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(j.error || "Subscribe failed");
}

/* =========================
   Public flow
========================= */
async function subscribeFlow() {
  setStatus("1/4 Chargement clé VAPID…");
  const vapidKey = await fetchVapidPublicKey();

  setStatus("2/4 Initialisation Service Worker…");
  const reg = await getReadyServiceWorker();

  setStatus("3/4 Abonnement notifications…");
  const sub = await subscribePush(reg, vapidKey);

  setStatus("4/4 Enregistrement serveur…");
  await saveSubscription(sub);

  setStatus("✅ Notifications activées");
}

/* =========================
   Simulation helpers
========================= */
async function startSimulation() {
  const payload = {
    shopName: $("shopName")?.value || "Ma Boutique",
    count: Number($("count")?.value || 5),
    minSec: Number($("minSec")?.value || 2),
    maxSec: Number($("maxSec")?.value || 6),
    orderStart: Number($("orderStart")?.value || 28000),
    priceMin: Number($("priceMin")?.value || 20),
    priceMax: Number($("priceMax")?.value || 80),
    mode: $("mode")?.value || "random"
  };

  const r = await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error("Start error: " + t);
  }
}

async function stopSimulation() {
  await fetch("/api/stop", { method: "POST" });
}

/* =========================
   UI bindings
========================= */
window.addEventListener("load", () => {
  $("btnStart")?.addEventListener("click", async () => {
    try {
      await subscribeFlow();
      await startSimulation();
    } catch (e) {
      console.error(e);
      setStatus("❌ " + (e?.message || e));
    }
  });

  $("btnStop")?.addEventListener("click", async () => {
    try {
      await stopSimulation();
      setStatus("⏹️ Arrêté");
    } catch (_) {
      setStatus("Erreur stop");
    }
  });
});
