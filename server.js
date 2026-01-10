const express = require("express");
const webpush = require("web-push");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// === VAPID (tes clés) ===
const VAPID_PUBLIC_KEY =
  "BIx8mJqDSo615gziR_eVBWIS5fduBJqhQeyJ-nA8oGZp9WHQqw8Xggp7JG4W_mIyh8SNtYlnPg0W6yUafRS-DaM";
const VAPID_PRIVATE_KEY =
  "ZjD8KcjVAdQAIQqv6vY4WmyKMU8R7EQbA_VhyPNDet4";

// email "contact" requis par VAPID (tu peux laisser)
webpush.setVapidDetails(
  "mailto:demo@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// Stockage simple (une seule subscription pour le test)
let subscription = null;
let running = false;
let timer = null;
let counter = 1000;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendDemoNotification(payload) {
  if (!subscription) throw new Error("No subscription saved");
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

function scheduleNext(minSec, maxSec) {
  if (!running) return;

  const delaySec = randInt(minSec, maxSec);

  timer = setTimeout(async () => {
    try {
      counter += 1;
      const payload = {
        title: "Simulation – Nouvel événement",
        body: `Événement simulé #${counter} — ${randInt(10, 99)}€`,
        url: "/?from=push",
      };
      await sendDemoNotification(payload);
      console.log("✅ Push envoyé:", payload.body);
    } catch (e) {
      console.log("❌ Push error:", e?.statusCode || "", e?.body || e?.message || e);
    } finally {
      scheduleNext(minSec, maxSec);
    }
  }, delaySec * 1000);

  console.log(`⏱️ Prochain push dans ${delaySec}s`);
}

// API
app.get("/api/vapidPublicKey", (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

app.post("/api/subscribe", (req, res) => {
  subscription = req.body;
  console.log("✅ Subscription enregistrée");
  res.json({ ok: true });
});

app.post("/api/start", (req, res) => {
  const { minSec = 30, maxSec = 90 } = req.body || {};
  running = true;

  if (timer) clearTimeout(timer);
  timer = null;

  scheduleNext(Number(minSec), Number(maxSec));
  res.json({ ok: true, running: true });
});

app.post("/api/stop", (req, res) => {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
  res.json({ ok: true, running: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on http://localhost:" + PORT));
