const express = require("express");
const webpush = require("web-push");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   VAPID INIT (FAIL FAST)
========================= */
const VAPID_PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const VAPID_PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("❌ Missing VAPID keys");
  process.exit(1);
}

try {
  webpush.setVapidDetails(
    "mailto:demo@example.com",
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log("✅ VAPID ready");
} catch (e) {
  console.error("❌ VAPID init error:", e);
  process.exit(1);
}

/* =========================
   DEBUG
========================= */
app.get("/api/version", (req, res) => {
  res.json({
    ok: true,
    ts: new Date().toISOString(),
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
   SUBSCRIPTION (MEMORY)
========================= */
let subscription = null;

/* =========================
   LOGO UPLOAD (OPTIONAL)
========================= */
const upload = multer({ dest: "/tmp" });
let customLogoPath = null;

app.post("/api/logo", upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ ok: false });
  customLogoPath = req.file.path;
  res.json({ ok: true });
});

app.get("/icon.png", (req, res) => {
  if (customLogoPath && fs.existsSync(customLogoPath)) {
    return res.sendFile(customLogoPath);
  }
  return res.sendFile(path.join(__dirname, "public", "icon-192.png"));
});

/* =========================
   HELPERS
========================= */
function formatPrice(amount) {
  return `€${Number(amount).toFixed(2)}`;
}

/*
  ✅ PONDERATED PRICES
  Lower prices appear more often on purpose
*/
const FIXED_PRICES = [
  21.95, 21.95,
  24.95, 24.95,
  39.90,
  44.90
];

function pickRandomPrice() {
  const idx = Math.floor(Math.random() * FIXED_PRICES.length);
  return FIXED_PRICES[idx];
}

// ✅ Items logic
function itemsFromPrice(price) {
  if (price > 52) return 3;
  if (price > 35) return 2;
  return 1;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* =========================
   SUBSCRIBE
========================= */
app.post("/api/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return res.status(400).json({ ok: false });
  }
  subscription = sub;
  res.json({ ok: true });
});

/* =========================
   TEST PUSH
========================= */
app.post("/api/testPush", async (req, res) => {
  if (!subscription) return res.status(400).json({ ok: false });

  const payload = {
    title: "Order #28042",
    body: "€21.95, 1 item from Online Store\n• My Store",
    icon: "/icon-192.png",
    badge: "/icon-192.png"
  };

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
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
    if (!subscription) return res.status(400).json({ ok: false });

    const {
      shopName = "My Store",
      count = 5,
      minSec = 2,
      maxSec = 6,
      startDelaySec = 0,
      orderStart = 28000,
      mode = "random"
    } = req.body || {};

    if (startDelaySec > 0) {
      await sleep(startDelaySec * 1000);
    }

    let order = Number(orderStart);

    for (let i = 0; i < count; i++) {
      if (stopFlag) break;

      const price = pickRandomPrice();
      const items = itemsFromPrice(price);

      const payload = {
        title: `Order #${order}`,
        body: `${formatPrice(price)}, ${items} item${items > 1 ? "s" : ""} from Online Store\n• ${shopName}`,
        icon: "/icon-192.png",
        badge: "/icon-192.png"
      };

      try {
        await webpush.sendNotification(subscription, JSON.stringify(payload));
      } catch (e) {
        console.error("Push error:", e);
      }

      order++;

      const wait =
        mode === "steady"
          ? minSec * 1000
          : (Math.random() * (maxSec - minSec) + minSec) * 1000;

      await sleep(wait);
    }

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false });
  }
});

/* =========================
   START
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
