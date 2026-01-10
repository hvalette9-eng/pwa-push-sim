// server.js
// Express + web-push : simulation de notifications "Commande #xxxx" (2 lignes) + paramètres depuis l'UI
// + option upload logo (utilisé comme icon/badge dans le payload push)

const express = require("express");
const webpush = require("web-push");
const multer = require("multer");
const fs = require("fs");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// =====================
// VAPID KEYS (TES CLÉS)
// =====================
const VAPID_PUBLIC_KEY =
  "BIx8mJqDSo615gziR_eVBWIS5fduBJqhQeyJ-nA8oGZp9WHQqw8Xggp7JG4W_mIyh8SNtYlnPg0W6yUafRS-DaM";
const VAPID_PRIVATE_KEY =
  "ZjD8KcjVAdQAIQqv6vY4WmyKMU8R7EQbA_VhyPNDet4";

webpush.setVapidDetails(
  "mailto:demo@example.com",
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

// =====================
// Upload logo (optionnel)
// =====================
const TMP_LOGO_PATH = "/tmp/user-logo.png";

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, "/tmp"),
    filename: (req, file, cb) => cb(null, "user-logo.png"),
  }),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

app.post("/api/logo", upload.single("logo"), (req, res) => {
  // Rend dispo via GET /user-logo.png
  res.json({ ok: true, url: "/user-logo.png" });
});

app.get("/user-logo.png", (req, res) => {
  if (!fs.existsSync(TMP_LOGO_PATH)) return res.status(404).send("No logo uploaded");
  res.sendFile(TMP_LOGO_PATH);
});

// =====================
// Push subscription
// =====================
let subscription = null;

app.get("/api/vapidPublicKey", (req, res) => {
  res.json({ key: VAPID_PUBLIC_KEY });
});

app.post("/api/subscribe", (req, res) => {
  subscription = req.body;
  console.log("✅ Subscription enregistrée");
  res.json({ ok: true });
});

// =====================
// Simulation state
// =====================
let running = false;
let timer = null;

let cfg = null;
let sent = 0;
let orderNo = 1000;

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function nextDelayMs() {
  if (!cfg) return 2000;

  const minMs = Math.max(100, Number(cfg.minSec) * 1000);
  const maxMs = Math.max(minMs, Number(cfg.maxSec) * 1000);

  if (cfg.mode === "steady") {
    return Math.round((minMs + maxMs) / 2);
  }
  return Math.round(randFloat(minMs, maxMs));
}

function formatPrice(amount, lang) {
  const v = Math.round(amount * 100) / 100;

  if (lang === "fr") {
    // ex: 39,95 €
    const str = (v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)).replace(".", ",");
    return `${str} €`;
  }

  // ex: £39.95
  return `£${v % 1 === 0 ? v.toFixed(0) : v.toFixed(2)}`;
}

/**
 * Format voulu :
 * Title: "Commande #24682"
 * Body:
 *   "€39,95, 1 article de Boutique en ligne"
 *   "• Shoox"
 */
function buildNotificationPayload() {
  const lang = cfg?.lang === "en" ? "en" : "fr";

  const shop = String(cfg?.shopName || "Ma Marque").trim();

  const price = randFloat(cfg.priceMin, cfg.priceMax);
  const priceStr = formatPrice(price, lang);

  const itemsCount = 1; // simple (tu me dis si tu veux random / configurable)

  const title = `Commande #${orderNo}`;

  const line1 =
    lang === "en"
      ? `${priceStr}, ${itemsCount} item from Online Store`
      : `${priceStr}, ${itemsCount} article de Boutique en ligne`;

  const line2 = `• ${shop}`;

  // Icône envoyée dans le payload (iOS peut afficher l'icône PWA à la place)
  const iconUrl =
    cfg?.iconUrl ||
    (fs.existsSync(TMP_LOGO_PATH) ? "/user-logo.png" : "/icon-192.png");

  return {
    title,
    body: `${line1}\n${line2}`,
    url: "/?from=push",
    tag: "order",
    icon: iconUrl,
    badge: iconUrl,
  };
}

async function sendPush(payload) {
  if (!subscription) throw new Error("No subscription saved");
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

function scheduleNext() {
  if (!running || !cfg) return;

  if (sent >= cfg.count) {
    running = false;
    clearTimer();
    console.log("✅ Terminé: batch envoyé");
    return;
  }

  const delay = nextDelayMs();
  timer = setTimeout(async () => {
    try {
      orderNo += 1;

      const payload = buildNotificationPayload();
      await sendPush(payload);

      sent += 1;
      console.log(
        `✅ Push ${sent}/${cfg.count}:`,
        payload.title,
        "|",
        payload.body.replace("\n", " / ")
      );
    } catch (e) {
      console.log("❌ Push error:", e?.statusCode || "", e?.body || e?.message || e);
    } finally {
      scheduleNext();
    }
  }, delay);

  console.log(`⏱️ Prochain push dans ${(delay / 1000).toFixed(1)}s`);
}

// =====================
// Start / Stop
// =====================
app.post("/api/start", (req, res) => {
  const body = req.body || {};

  cfg = {
    shopName: String(body.shopName || "Ma Marque").trim(),
    count: Math.max(1, Math.floor(Number(body.count || 5))),
    minSec: Math.max(0.1, Number(body.minSec || 2)),
    maxSec: Math.max(0.1, Number(body.maxSec || 6)),
    orderStart: Math.max(1, Math.floor(Number(body.orderStart || 1000))),
    priceMin: Math.max(0, Number(body.priceMin || 20)),
    priceMax: Math.max(0, Number(body.priceMax || 80)),
    lang: body.lang === "en" ? "en" : "fr",
    mode: body.mode === "steady" ? "steady" : "random",
    iconUrl: body.iconUrl ? String(body.iconUrl) : undefined,
  };

  // garde-fous
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

  sent = 0;
  orderNo = cfg.orderStart;

  running = true;
  clearTimer();
  scheduleNext();

  res.json({ ok: true, running: true, cfg });
});

app.post("/api/stop", (req, res) => {
  running = false;
  clearTimer();
  res.json({ ok: true, running: false });
});

// debug/health
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    running,
    hasSubscription: !!subscription,
    hasLogo: fs.existsSync(TMP_LOGO_PATH),
  });
});

// =====================
// Listen
// =====================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
