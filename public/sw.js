// public/sw.js

self.addEventListener("install", (event) => {
  // Force l'activation immédiate (important iOS/Safari)
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Prend le contrôle tout de suite (important iOS/Safari)
  event.waitUntil(self.clients.claim());
});

function safeParsePushData(event) {
  if (!event.data) return {};
  // Certains navigateurs envoient du JSON, d'autres du texte
  try {
    return event.data.json();
  } catch (_) {
    try {
      return JSON.parse(event.data.text());
    } catch (_) {
      return { body: event.data.text() };
    }
  }
}

self.addEventListener("push", (event) => {
  const data = safeParsePushData(event);

  const title = data.title || "Commande";
  const body = data.body || "";

  const options = {
    body,
    icon: data.icon || "/icon-192.png",
    badge: data.badge || data.icon || "/icon-192.png",
    tag: data.tag || "order",
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

async function focusOrOpen(url) {
  const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  for (const client of allClients) {
    // Si on a déjà un onglet sur le même origin, on le focus
    if (client.url && new URL(client.url).origin === self.location.origin) {
      try {
        await client.focus();
        return;
      } catch (_) {}
    }
  }

  // Sinon on ouvre
  try {
    await self.clients.openWindow(url);
  } catch (_) {
    // fallback ultime
    await self.clients.openWindow("/");
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification?.data && event.notification.data.url) || "/";
  event.waitUntil(focusOrOpen(url));
});
