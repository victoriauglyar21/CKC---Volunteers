self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Notification", body: event.data?.text() };
  }

  const title = payload.title || "Notification";
  const payloadData =
    payload.data && typeof payload.data === "object" && !Array.isArray(payload.data) ? payload.data : {};
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/pwa-192.png",
    badge: payload.badge || "/pwa-192.png",
    actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : undefined,
    data: { url: payload.url || "/", ...payloadData },
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

async function notifyPushSubscriptionChanged() {
  const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  await Promise.all(
    clientsArr.map((client) => client.postMessage({ type: "push-subscription-changed" })),
  );
}

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const applicationServerKey = event.oldSubscription?.options?.applicationServerKey;
        if (applicationServerKey) {
          await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey,
          });
        }
      } catch {
        // Ignore re-subscribe failures here; the app repairs the subscription on next resume.
      }

      await notifyPushSubscriptionChanged();
    })(),
  );
});

async function openNotificationUrl(targetUrl) {
  const safeUrl = targetUrl || "/";
  const clientsArr = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientsArr) {
    if (client.url === safeUrl && "focus" in client) {
      return client.focus();
    }
  }
  if (self.clients.openWindow) {
    return self.clients.openWindow(safeUrl);
  }
  return null;
}

async function approveRequestFromNotification(data) {
  const endpoint = typeof data?.approve_action_endpoint === "string" ? data.approve_action_endpoint : "";
  const token = typeof data?.approve_action_token === "string" ? data.approve_action_token : "";
  const apikey = typeof data?.approve_action_apikey === "string" ? data.approve_action_apikey : "";
  if (!endpoint || !token) {
    return false;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apikey ? { apikey } : {}),
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      return false;
    }

    await self.registration.showNotification("Shift request approved", {
      body: "Approved from notification.",
      icon: "/pwa-192.png",
      badge: "/pwa-192.png",
      data: { url: data?.url || "/?view=notifications" },
    });
    return true;
  } catch {
    return false;
  }
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const targetUrl = data.url || "/";

  if (event.action === "approve-request") {
    event.waitUntil(
      (async () => {
        const approved = await approveRequestFromNotification(data);
        if (!approved) {
          await openNotificationUrl(data.approve_url || targetUrl);
        }
      })(),
    );
    return;
  }

  if (event.action === "deny-request") {
    event.waitUntil(openNotificationUrl(data.deny_url || targetUrl));
    return;
  }

  event.waitUntil(openNotificationUrl(targetUrl));
});
