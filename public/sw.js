const CACHE_NAME = "cloudcon-pwa-v7";
const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/logos/logo-stroke-transparent.svg",
  "/logos/logo-stroke-white.svg",
  "/logos/logo-fill-transparent.svg",
  "/logos/logo-fill-white.svg",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {});
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API 요청(/api/*)은 절대 캐시하지 않고 항상 네트워크로 전달 (인증 쿠키 및 최신 데이터 보장)
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // SPA 네비게이션 요청은 Network-First 전략 (오프라인일 때만 캐시된 루트 HTML 반환)
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(async () => {
          const cached = await caches.match("/");
          return cached || Response.error();
        })
    );
    return;
  }

  // 동일 출처 정적 에셋은 Network-First with Cache Fallback
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
  }
});
