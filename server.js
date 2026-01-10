const express = require("express");
const webpush = require("web-push");

const app = express();
app.use(express.json());
app.use(express.static("public"));

// === VAPID (mets bien tes clés) ===
const VAPID_PUBLIC_KEY =
  "BIx8mJqDSo615gziR_eVBWIS5fduBJqhQeyJ-nA8oGZp9WHQqw8Xggp7JG4W_mIyh8SNtYlnPg0W6yUafRS-DaM";
const VAPID_PRIVATE_KEY =
  "ZjD8KcjVAdQAIQqv6vY4WmyKMU8R7EQbA_VhyPNDet4";

webpush.setVapidDetails("mailto:demo@example.com", VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

let subscription = null;
let running = false;
let timer = null;

// state for current run
let cfg = null;
let sent = 0;
let orderNo = 1000;

const FR_FIRSTNAMES = ["Julien", "Sarah", "Lucas", "Emma", "Nina", "Hugo", "Lina", "Thomas", "Manon", "Adam"];
const FR_CITIES = ["Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes", "Lille", "Bordeaux", "Rennes", "Strasbourg"];
const FR_PRODUCTS = ["T-shirt", "Hoodie", "Casquette", "Sweat", "Coque", "Sac", "Baskets", "Montre", "Parfum", "Lunettes"];

const EN_FIRSTNAMES = ["James", "Olivia", "Noah", "Emma", "Mia", "Liam", "Ava", "Ethan", "Sofia", "Leo"];
const EN_CITIES = ["London", "Manchester", "Birmingham", "Liverpool", "Leeds", "Bristol", "Sheffield", "Glasgow", "Cardiff", "Edinburgh"];
const EN_PRODUCTS = ["T-shirt", "Hoodie", "Cap", "Sweatshirt", "Phone case", "Bag", "Sneakers", "Watch", "Perfume", "Sunglasses"];

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

function formatPrice(amount, lang) {
  // arrondir à 2 décimales si besoin
  const v = Math.round(amount * 100) / 100;
  if (lang === "fr") {
    // ex: 43 €
    return `${v.toFixed(v % 1 === 0 ? 0 : 2)} €`;
  }
  // en: £ or $
  return `£${v.toFixed(v % 1 === 0 ? 0 : 2)}`;
}

function buildNotificationPayload() {
  const lang = cfg?.lang === "en" ? "en" : "fr";

  const first = lang === "en" ? pick(EN_FIRSTNAMES) : pick(FR_FIRSTNAMES);
  const city = lang === "en" ? pick(EN_CITIES) : pick(FR_CITIES);
  const product = lang === "en" ? pick(EN_PRODUCTS) : pick(FR_PRODUCTS);

  const price = randFloat(cfg.priceMin, cfg.priceMax);
  const priceStr = formatPrice(price, lang);

  // titres “neutres” (démo)
  const title = lang === "en" ? "New order (demo)" : "Nouvelle commande (démo)";

  // format type: "Julien • Paris • 43 € — T-shirt"
  const body =
    lang === "en"
      ? `${first} • ${city} • ${priceStr} — ${product} (#${orderNo})`
      : `${first} • ${city} • ${priceStr} — ${product} (#${orderNo})`;

  return {
    title,
    body,
    url: "/?from=push",
  };
}

async function send(payload) {
  if (!subscription) throw new Error("No subscription saved");
  await webpush.sendNotification(subscription, JSON.stringify(payload));
}

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

function nextDelayMs() {
  if (!cfg) return 2000;
  const minMs = Math.max(100, cfg.minSec * 1000);
  const maxMs = Math.max(100, cfg.maxSec * 1000);

  if (cfg.mode === "steady") {
    return Math.round((minMs + maxMs) / 2);
  }
  // random
  return Math.round(randFloat(minMs, maxMs));
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
      await send(payload);
      sent += 1;
      console.log(`✅ Push ${sent}/${cfg.count}:`, payload.body);
    } catch (e) {
      console.log("❌ Push error:", e?.statusCode || "", e?.body || e?.message || e);
    } finally {
      scheduleNext();
    }
  }, delay);

  console.log(`⏱️ Prochain push dans ${(delay / 1000).toFixed(1)}s`);
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
  cfg = req.body || {};
  // sécurise/normalise
  cfg.shopName = String(cfg.shopName || "Ma Marque").trim();
  cfg.count = Math.max(1, Math.floor(Number(cfg.count || 5)));
  cfg.minSec = Math.max(0.1, Number(cfg.minSec || 2));
  cfg.maxSec = Math.max(cfg.minSec, Number(cfg.maxSec || 6));
  cfg.orderStart = Math.max(1, Math.floor(Number(cfg.orderStart || 1000)));
  cfg.priceMin = Math.max(0, Number(cfg.priceMin || 20));
  cfg.priceMax = Math.max(cfg.priceMin, Number(cfg.priceMax || 80));
  cfg.lang = cfg.lang === "en" ? "en" : "fr";
  cfg.mode = cfg.mode === "steady" ? "steady" : "random";

  sent = 0;
  orderNo = cfg.orderStart;

  running = true;
  clearTimer();
  scheduleNext();

  res.json({ ok: true, running: true });
});

app.post("/api/stop", (req, res) => {
  running = false;
  clearTimer();
  res.json({ ok: true, running: false });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 Server running on port", PORT));
