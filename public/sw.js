self.addEventListener("push", event => {
  let data = {};
  try { data = event.data.json(); } catch {}

  const title = data.title || "Commande";
  const body = data.body || "";
  const icon = data.icon || "/icon-192.png";   // fallback
  const badge = data.badge || icon;

  const options = {
    body,
    icon,
    badge,
    tag: data.tag || "order",     // regroupe les notifs
    renotify: true,               // renotifie si même tag
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data.url || "/";
  event.waitUntil(clients.openWindow(url));
});
