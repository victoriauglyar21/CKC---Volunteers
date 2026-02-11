self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Notification", body: event.data?.text() };
  }

  const title = payload.title || "Notification";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/pwa-192.png",
    badge: payload.badge || "/pwa-192.png",
    data: { url: payload.url || "/" },
  };

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      (async () => {
        try {
          if (self.navigator && typeof self.navigator.setAppBadge === "function") {
            const badgeCount =
              typeof payload.badgeCount === "number" && Number.isFinite(payload.badgeCount)
                ? Math.max(0, Math.floor(payload.badgeCount))
                : 1;
            if (badgeCount > 0) {
              await self.navigator.setAppBadge(badgeCount);
            }
          }
        } catch {
          // Ignore badge failures; notifications should still work.
        }
      })(),
    ]),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientsArr) => {
      for (const client of clientsArr) {
        if (client.url === targetUrl && "focus" in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    }),
  );
});
