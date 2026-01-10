const statusEl = document.getElementById("status");

function setStatus(msg) {
  statusEl.textContent = msg;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function enableNotifications() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service Worker non supporté");
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Permission refusée");
  }

  const reg = await navigator.serviceWorker.register("/sw.js");

  const res = await fetch("/api/vapidPublicKey");
  const { key } = await res.json();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });

  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });

  setStatus("✅ Notifications activées");
}

async function startSimulation() {
  const minSec = Number(document.getElementById("minSec").value);
  const maxSec = Number(document.getElementById("maxSec").value);

  await fetch("/api/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minSec, maxSec }),
  });

  setStatus("▶️ Simulation démarrée");
}

async function stopSimulation() {
  await fetch("/api/stop", { method: "POST" });
  setStatus("⏹️ Simulation stoppée");
}

document.getElementById("btnEnable").onclick = () =>
  enableNotifications().catch(e => setStatus("❌ " + e.message));

document.getElementById("btnStart").onclick = () =>
  startSimulation().catch(e => setStatus("❌ " + e.message));

document.getElementById("btnStop").onclick = () =>
  stopSimulation().catch(e => setStatus("❌ " + e.message));
