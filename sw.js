// ============================================================
//  Service Worker - Phong Vũ SC PWA
//  Chiến lược: Cache-first cho assets, Network-first cho app
// ============================================================

const SW_VERSION   = 'v1.0.0';
const CACHE_STATIC = `pv-static-${SW_VERSION}`;
const CACHE_PAGES  = `pv-pages-${SW_VERSION}`;

// Các file cần cache ngay khi cài SW (shell của app)
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

// Trang offline fallback
const OFFLINE_PAGE = './index.html';

// ══ INSTALL ══════════════════════════════════════════════════
// Chạy một lần khi SW được cài lần đầu
self.addEventListener('install', event => {
  console.log(`[SW ${SW_VERSION}] Installing...`);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => {
        console.log(`[SW] Caching static assets`);
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        // Kích hoạt ngay, không chờ trang cũ đóng
        return self.skipWaiting();
      })
      .catch(err => console.warn('[SW] Install cache error:', err))
  );
});

// ══ ACTIVATE ═════════════════════════════════════════════════
// Dọn dẹp cache cũ khi có phiên bản SW mới
self.addEventListener('activate', event => {
  console.log(`[SW ${SW_VERSION}] Activating...`);
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_STATIC && name !== CACHE_PAGES)
            .map(name => {
              console.log(`[SW] Deleting old cache: ${name}`);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        // Tiếp quản tất cả tab ngay lập tức
        return self.clients.claim();
      })
  );
});

// ══ FETCH ════════════════════════════════════════════════════
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Bỏ qua các request không phải GET
  if (request.method !== 'GET') return;

  // Bỏ qua các request đến Google Apps Script (luôn cần mạng)
  if (url.hostname.includes('script.google.com') ||
      url.hostname.includes('googleusercontent.com') ||
      url.hostname.includes('googleapis.com')) {
    return; // Để browser xử lý bình thường
  }

  // Bỏ qua chrome-extension và các scheme đặc biệt
  if (!url.protocol.startsWith('http')) return;

  // Chiến lược: Cache First (cho assets tĩnh) → Network fallback
  event.respondWith(
    caches.match(request)
      .then(cachedResponse => {
        if (cachedResponse) {
          // Có trong cache → trả về ngay, đồng thời cập nhật cache ngầm
          fetchAndUpdateCache(request);
          return cachedResponse;
        }

        // Không có trong cache → lấy từ mạng
        return fetch(request)
          .then(networkResponse => {
            // Chỉ cache response hợp lệ
            if (networkResponse && networkResponse.status === 200 &&
                networkResponse.type !== 'opaque') {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_STATIC)
                .then(cache => cache.put(request, responseClone));
            }
            return networkResponse;
          })
          .catch(() => {
            // Không có mạng → trả về trang offline
            if (request.mode === 'navigate') {
              return caches.match(OFFLINE_PAGE);
            }
          });
      })
  );
});

// Cập nhật cache ngầm (stale-while-revalidate)
function fetchAndUpdateCache(request) {
  return fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        caches.open(CACHE_STATIC)
          .then(cache => cache.put(request, response));
      }
    })
    .catch(() => {}); // Bỏ qua lỗi mạng khi update ngầm
}

// ══ MESSAGE ══════════════════════════════════════════════════
// Nhận lệnh từ trang chính (ví dụ: force refresh)
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
  }
});
