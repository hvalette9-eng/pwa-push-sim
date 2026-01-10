self.addEventListener("push", event => {
  let data = {};
  try {
    data = event.data.json();
  } catch {}

  const title = data.title || "Notification";
  const options = {
    body: data.body || "",
    data: { url: data.url || "/" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = event.notification.data.url || "/";
  event.waitUntil(clients.openWindow(url));
});
