const CACHE = 'tracker-bilanz-v7';

// Alles, was die App zum Starten braucht — inklusive der Seite selbst.
// Bis v6 fehlte hier die index.html. Dadurch ging die App bei schlechtem
// Netz (LTE unterwegs) gar nicht mehr auf: die Seite wurde immer aus dem
// Netz geholt, und der Rückfall auf den Speicher lief ins Leere.
const FILES = ['./', 'index.html', 'manifest.json', 'icon.png'];

// Wie lange auf das Netz gewartet wird, bevor die gespeicherte Fassung
// genommen wird. Im WLAN merkt man davon nichts, im schwachen LTE rettet
// es den Start.
const NETZ_TIMEOUT = 3000;

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c =>
      // Einzeln, nicht addAll: schlägt eine Datei fehl, soll trotzdem
      // alles andere im Speicher landen.
      Promise.all(FILES.map(f => c.add(f).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

function mitZeitlimit(request) {
  return new Promise((erfuellen, ablehnen) => {
    const uhr = setTimeout(() => ablehnen(new Error('zu langsam')), NETZ_TIMEOUT);
    fetch(request).then(antwort => {
      clearTimeout(uhr);
      erfuellen(antwort);
    }).catch(fehler => {
      clearTimeout(uhr);
      ablehnen(fehler);
    });
  });
}

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('localhost:5001')) return;
  if (url.includes('192.168.')) return;
  // Sync zu GitHub nie aus dem Speicher beantworten.
  if (url.includes('api.github.com')) return;
  if (e.request.method !== 'GET') return;

  // Die Seite selbst: erst das Netz versuchen, damit Änderungen sofort
  // ankommen — aber nur kurz. Danach die gespeicherte Fassung.
  if (e.request.destination === 'document' || e.request.mode === 'navigate') {
    e.respondWith(
      mitZeitlimit(e.request)
        .then(antwort => {
          if (antwort && antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE).then(c => c.put('index.html', kopie));
          }
          return antwort;
        })
        .catch(() =>
          caches.match('index.html')
            .then(gespeichert => gespeichert || caches.match('./'))
            .then(gespeichert => gespeichert || new Response(
              '<!doctype html><meta charset="utf-8">' +
              '<body style="font:16px -apple-system;padding:40px;text-align:center">' +
              'Die App konnte nicht geladen werden. Einmal mit Internet öffnen,' +
              ' danach geht sie auch ohne.</body>',
              {headers: {'Content-Type': 'text/html; charset=utf-8'}}
            ))
        )
    );
    return;
  }

  // Alles andere (Diagramm-Werkzeug, Schrift, Symbol): erst Speicher,
  // sonst Netz — und was neu geholt wurde, wird mitgespeichert, damit es
  // beim nächsten Mal auch ohne Netz da ist.
  e.respondWith(
    caches.match(e.request).then(gespeichert => {
      if (gespeichert) return gespeichert;
      return fetch(e.request).then(antwort => {
        if (antwort && (antwort.ok || antwort.type === 'opaque')) {
          const kopie = antwort.clone();
          caches.open(CACHE).then(c => c.put(e.request, kopie).catch(() => null));
        }
        return antwort;
      });
    })
  );
});
