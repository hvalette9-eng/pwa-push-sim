const express = require("express");
const webpush = require("web-push");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   DEBUG: version / health
========================= */
app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
    hasVapid: !!process.env.VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY
  });
});

/* =========================
   VAPID (Render env vars)
========================= */
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";

let VAPID_READY = false;
try {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
      "mailto:demo@example.com",
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );
    VAPID_READY = true;
    console.log("✅ VAPID ready");
  } else {
    console.warn("⚠️ Missing VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render env vars.");
  }
} catch (e) {
  console.error("❌ VAPID init error:", e);
}

/* =========================
   In-memory subscription
   (one phone / one sub)
========================= */
let subscription = null;

/* =========================
   Upload logo (optional)
========================= */
const upload = multer({ dest: "/tmp" });
let customLogoPath = null;

app.post("/api/logo", upload.single("logo"), (req, res) => {
  if (!req.file || !req.file.path) return res.status(400).json({ ok: false, error: "No file" });
  customLogoPath = req.file.path;
  res.json({ ok: true });
});

// If you want server-side icon endpoint
app.get("/icon.png", (req, res) => {
  // If a logo was uploaded, return it
  if (customLogoPath && fs.existsSync(customLogoPath)) {
    return res.sendFile(customLogoPath);
  }
  // Fallback to your PWA icon
  const fallback = path.join(__dirname, "public", "icon-192.png");
  return res.sendFile(fallback);
});

/* =========================
   Helpers: price + items
========================= */
function formatPriceEuroPrefix(amount) {
  const v = Math.round(Number(amount) * 100) / 100;
  return `€${v.toFixed(2)}`; // €29.95
}

function itemsFromPrice(amount) {
  const v = Number(amount);
  if (v >= 70) return 3;
  if (v >= 45) return 2;
  return 1;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/* =========================
   Subscribe endpoint
========================= */
app.post("/api/subscribe", (req, res) => {
  subscription = req.body;
  res.json({ ok: true });
});

/* =========================
   Start simulation
========================= */
let stopFlag = false;

app.post("/api/stop", (req, res) => {
  stopFlag = true;
  res.json({ ok: true });
});

app.post("/api/start", async (req, res) => {
  try {
    stopFlag = false;

    if (!VAPID_READY) {
      return res.status(500).json({
        ok: false,
        error: "VAPID not configured. Add VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in Render env vars."
      });
    }

    if (!subscription) {
      return res.status(400).json({ ok: false, error: "No subscription yet. Click 'Activer les notifications' first." });
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
        // For most iOS cases, the PWA icon is what you’ll see. Still set these for other platforms:
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: "order"
      };

      await webpush.sendNotification(subscription, JSON.stringify(payload));
      order++;

      let waitMs;
      if (mode === "steady") {
        waitMs = nMin * 1000;
      } else {
        waitMs = (Math.random() * (nMax - nMin) + nMin) * 1000;
      }

      await sleep(waitMs);
    }

    res.json({ ok: true, stopped: stopFlag });
  } catch (err) {
    console.error("❌ /api/start error:", err);
    res.status(500).json({ ok: false, error: "Server error. Check Render logs." });
  }
});

/* =========================
   Start server
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
