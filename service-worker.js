/**
 * service-worker.js
 * Service Worker para "Mi Kilometraje"
 * Estrategia:
 *   - Network-first para HTML, CSS, JS (ves cambios al instante si hay red)
 *   - Cache-first para manifest e iconos
 *   - Fallback offline: sirve index.html desde caché
 */

const CACHE_VERSION = 'v1.0.0';
const CACHE_NAME = 'kilometraje-' + CACHE_VERSION;

// Archivos a cachear en la instalación
const ARCHIVOS_CACHE = [
    './',
    './index.html',
    './styles.css',
    './js/app.js',
    './manifest.json',
    './js/data-storage.js',
    './js/gps-tracker.js'
];

// ============================================================
// INSTALACIÓN: cachea todos los archivos necesarios
// ============================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando versión:', CACHE_VERSION);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cacheando archivos...');
                return cache.addAll(ARCHIVOS_CACHE);
            })
            .then(() => {
                // Activar inmediatamente sin esperar a cerrar pestañas
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Error cacheando archivos:', error);
            })
    );
});

// ============================================================
// ACTIVACIÓN: limpia cachés viejos y toma control
// ============================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando versión:', CACHE_VERSION);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name.startsWith('kilometraje-') && name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Borrando caché viejo:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                // Tomar control de todas las pestañas abiertas
                return self.clients.claim();
            })
    );
});

// ============================================================
// FETCH: intercepta las peticiones
// ============================================================
self.addEventListener('fetch', (event) => {
    const { request } = event;

    // Ignorar métodos que no sean GET
    if (request.method !== 'GET') return;

    // Ignorar peticiones a otros dominios (analytics, etc.)
    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    // Determinar estrategia según el tipo de recurso
    const esHTML = request.headers.get('accept')?.includes('text/html');
    const esJS = url.pathname.endsWith('.js');
    const esCSS = url.pathname.endsWith('.css');
    const esHTMLDirecto = url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname.endsWith('/');

    // HTML, CSS, JS → Network-first (ves cambios al instante)
    if (esHTML || esJS || esCSS || esHTMLDirecto) {
        event.respondWith(networkFirst(request));
        return;
    }

    // Resto (manifest, iconos) → Cache-first
    event.respondWith(cacheFirst(request));
});

// ============================================================
// ESTRATEGIAS
// ============================================================

/**
 * Network-first: intenta la red primero, si falla usa el caché.
 * Ideal para HTML/CSS/JS en desarrollo y producción con conexión.
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        // Si la respuesta es OK, actualizamos el caché
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // Sin red: usar caché
        console.log('[SW] Sin red, sirviendo desde caché:', request.url);
        const cached = await caches.match(request);
        if (cached) return cached;

        // Fallback final: si es navegación (HTML), sirve index.html
        if (request.headers.get('accept')?.includes('text/html')) {
            const fallback = await caches.match('./index.html');
            if (fallback) return fallback;
        }

        // Sin nada: devolver error
        return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

/**
 * Cache-first: intenta el caché primero, si no está, va a la red.
 * Ideal para archivos estáticos que no cambian (iconos, manifest).
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) return cached;

    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        return new Response('Sin conexión', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
    }
}

// ============================================================
// MENSAJES desde la app (por si luego queremos forzar update)
// ============================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});