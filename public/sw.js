// public/sw.js
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data.json(); } catch {}

  const title = data.title || "Commande";

  const options = {
    body: data.body || "",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || data.icon || "/icon-192.png",
    tag: data.tag || "order",
    renotify: true,
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data.url || "/"));
});
