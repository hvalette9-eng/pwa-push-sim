const express = require("express");
const webpush = require("web-push");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   VAPID INIT (Render env vars) - FAIL FAST
========================= */
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error(
    "❌ Missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render env vars (no quotes, no spaces, no newlines)."
  );
  process.exit(1);
}

try {
  webpush.setVapidDetails("mailto:demo@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("✅ VAPID ready");
} catch (e) {
  console.error("❌ VAPID init error (invalid keys?):", e);
  process.exit(1);
}

/* =========================
   DEBUG / HEALTH
========================= */
app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    commitHint: process.env.RENDER_GIT_COMMIT || null,
    hasVapidEnv: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY,
    vapidPublicKeyLen: VAPID_PUBLIC_KEY.length
  });
});

/* =========================
   VAPID KEY FOR CLIENT
========================= */
app.get("/api/vapidPublicKey", (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

/* =========================
   IN-MEMORY SUBSCRIPTION
========================= */
let subscription = null;

/* =========================
   UPLOAD LOGO (optional)
========================= */
const upload = multer({ dest: "/tmp" });
let customLogoPath = null;

app.post("/api/logo", upload.single("logo"), (req, res) => {
  if (!req.file || !req.file.path) {
    return res.status(400).json({ ok: false, error: "No file" });
  }
  customLogoPath = req.file.path;
  res.json({ ok: true });
});

// Endpoint optionnel si tu veux servir un logo (souvent ignoré iOS notif)
app.get("/icon.png", (req, res) => {
  if (customLogoPath && fs.existsSync(customLogoPath)) {
    return res.sendFile(customLogoPath);
  }
  const fallback = path.join(__dirname, "public", "icon-192.png");
  return res.sendFile(fallback);
});

/* =========================
   HELPERS
========================= */
function formatPriceEuroPrefix(amount) {
  // Format EXACT demandé: €25.95 (point décimal)
  const v = Math.round(Number(amount) * 100) / 100;
  return `€${v.toFixed(2)}`;
}

function itemsFromPrice(amount) {
  // Logique demandée :
  // - > 70€ => 3 articles
  // - > 35€ => 2 articles
  // - sinon => 1 article
  const v = Number(amount);
  if (v > 70) return 3;
  if (v > 35) return 2;
  return 1;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* =========================
   SUBSCRIBE (validated)
========================= */
app.post("/api/subscribe", (req, res) => {
  const sub = req.body;

  if (!sub || typeof sub !== "object") {
    return res.status(400).json({ ok: false, error: "Invalid subscription payload" });
  }
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) {
    return res.status(400).json({
      ok: false,
      error: "Subscription missing endpoint/keys (endpoint, keys.p256dh, keys.auth required)"
    });
  }

  subscription = sub;
  res.json({ ok: true });
});

/* =========================
   TEST PUSH (recommended)
========================= */
app.post("/api/testPush", async (req, res) => {
  if (!subscription) {
    return res.status(400).json({ ok: false, error: "No subscription yet. Click 'Activer les notifications' first." });
  }

  const payload = {
    title: "Commande #28042",
    body: "€29.95, 2 ou 3 articles de Boutique en ligne\n• Ma Boutique",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: "order"
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    res.json({ ok: true });
  } catch (e) {
    console.error("❌ testPush error:", e?.statusCode || "", e?.body || e);
    res.status(500).json({
      ok: false,
      error: "Push failed",
      statusCode: e?.statusCode,
      details: e?.body || String(e)
    });
  }
});

/* =========================
   SIMULATION
========================= */
let stopFlag = false;

app.post("/api/stop", (req, res) => {
  stopFlag = true;
  res.json({ ok: true });
});

app.post("/api/start", async (req, res) => {
  try {
    stopFlag = false;

    if (!subscription) {
      return res.status(400).json({
        ok: false,
        error: "No subscription yet. Click 'Activer les notifications' first."
      });
    }

    const {
      shopName = "Ma Boutique",
      count = 5,
      minSec = 2,
      maxSec = 6,
      orderStart = 28000,
      priceMin = 20,
      priceMax = 80,
      mode = "random"
    } = req.body || {};

    const nCount = Math.max(1, Number(count));
    const nMin = Math.max(0.1, Number(minSec));
    const nMax = Math.max(nMin, Number(maxSec));
    const nOrderStart = Number(orderStart);
    const nPriceMin = Number(priceMin);
    const nPriceMax = Math.max(nPriceMin, Number(priceMax));

    let order = nOrderStart;

    for (let i = 0; i < nCount; i++) {
      if (stopFlag) break;

      const price = Math.random() * (nPriceMax - nPriceMin) + nPriceMin;
      const items = itemsFromPrice(price);

      const payload = {
        title: `Commande #${order}`,
        body: `${formatPriceEuroPrefix(price)}, ${items} article${items > 1 ? "s" : ""} de Boutique en ligne\n• ${shopName}`,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "order"
      };

      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (pushErr) {
        // Ne fait pas crasher Render / la boucle
        console.error("❌ push error:", pushErr?.statusCode || "", pushErr?.body || pushErr);
      }

      order++;

      const waitMs =
        mode === "steady"
          ? nMin * 1000
          : (Math.random() * (nMax - nMin) + nMin) * 1000;

      await sleep(waitMs);
    }

    res.json({ ok: true, stopped: stopFlag });
  } catch (err) {
    console.error("❌ /api/start error:", err);
    res.status(500).json({ ok: false, error: "Server error. Check Render logs." });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
