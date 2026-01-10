// public/sw.js
// Service Worker – affichage des notifications (structure "Commande #xxxx" + 2 lignes)

self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data.json();
  } catch (e) {}

  const title = data.title || "Commande";

  const options = {
    body: data.body || "",
    // iOS peut ignorer icon/badge et utiliser l’icône de la PWA,
    // mais on les fournit quand même
    icon: data.icon || "/icon-192.png",
    badge: data.badge || data.icon || "/icon-192.png",

    // tag identique = regroupement des notifs
    tag: data.tag || "order",
    renotify: true,

    data: {
      url: data.url || "/"
    }
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || "/")
  );
});
