/* Imported by the generated service worker (see vite.config.ts → workbox.importScripts).
 * Handles web push and notification clicks. The server sends a JSON payload:
 *   { "title": "...", "body": "...", "href": "/place/n123", "tag": "deal-42" }
 * `href` is an in-app path. The app may be hosted under a sub-path (for example /near-me/ on
 * GitHub Pages), so every path here is resolved against the worker's scope, never the domain root.
 */

const scope = () => self.registration.scope; // always ends with "/"
const inApp = (path) => new URL(String(path || '').replace(/^\/+/, ''), scope()).href;

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'NearMe';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: inApp('icons/icon-192.png'),
      badge: inApp('icons/icon-192.png'),
      tag: data.tag || 'nearme',
      data: { href: data.href || '/notifications' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = inApp((event.notification.data && event.notification.data.href) || '/');
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Reuse an open NearMe window when there is one; otherwise open a new one at the deep link.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

/* When the push service rotates the subscription, tell open pages so they can re-register it. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => clients.forEach((c) => c.postMessage({ type: 'nearme:pushsubscriptionchange' }))),
  );
});
