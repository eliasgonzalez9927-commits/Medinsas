// Service worker minimo, solo para cumplir el criterio de instalabilidad
// de PWA en Chrome/Edge (icono "Instalar app" en la barra de direcciones y
// acceso directo de escritorio) - no cachea nada a proposito, siempre pide
// todo a la red, para no servir versiones viejas de la app.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
