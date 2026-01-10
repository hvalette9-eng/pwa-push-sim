const $ = (id) => document.getElementById(id);

let running = false;

function setStatus(msg) {
  const el = $("status");
  if (el) el.textContent = msg || "";
}

// Convertit une clé VAPID Base64URL en Uint8Array (format attendu)
function urlBase64ToUint8Array(base64String) {
  // retire espaces / retours lignes accidentels
  base64String = (base64String || "").trim();

  // base64url -> base64
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

async function getVapidPublicKey() {
  const r = await fetch("/api/vapidPublicKey");
  const j = await r.json();
  if (!j.publicKey) throw new Error("VAPID public key missing on server");
  return j.publicKey.trim();
}

async function ensureServiceWorker() {
  if (!("serviceWorker" in navigator)) throw new Error("Service Worker non supporté");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  return reg;
}

async function subscribePush() {
  // 1) permissions
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications refusées");

  // 2) sw
  const reg = await ensureServiceWorker();

  // 3) VAPID key depuis serveur
  const publicKey = await getVapidPublicKey();
  const appServerKey = urlBase64ToUint8Array(publicKey);

  // 4) subscribe
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    appServerKey
  });

  // 5) envoie au serveur
  const resp = await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub)
  });

  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || "Subscribe error");

  return true;
}

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

  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Start error");

  return j;
}

async function stopSimulation() {
  await fetch("/api/stop", { method: "POST" });
}

async function uploadLogoIfAny() {
  const input = $("logoFile");
  if (!input || !input.files || !input.files[0]) return;

  const fd = new FormData();
  fd.append("logo", input.files[0]);

  const r = await fetch("/api/logo", { method: "POST", body: fd });
  const j = await r.json();
  if (!j.ok) throw new Error(j.error || "Logo upload error");
}

window.addEventListener("load", () => {
  $("btnStart")?.addEventListener("click", async () => {
    if (running) return;

    try {
      running = true;
      setStatus("Activation des notifications…");

      await subscribePush();

      setStatus("Upload logo (optionnel)…");
      await uploadLogoIfAny();

      setStatus("Simulation en cours…");
      await startSimulation();

      setStatus("Terminé ✅");
    } catch (e) {
      console.error(e);
      setStatus(`Erreur: ${e.message || e}`);
    } finally {
      running = false;
    }
  });

  $("btnStop")?.addEventListener("click", async () => {
    try {
      await stopSimulation();
      setStatus("Stop ✅");
    } catch (e) {
      console.error(e);
      setStatus("Erreur stop");
    }
  });
});
