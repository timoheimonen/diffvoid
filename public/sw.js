// MIT License
// Copyright (c) 2026 Timo Heimonen <timo.heimonen@proton.me>
// See LICENSE file for full terms at github.com/timoheimonen/diffvoid

const swUrl = new URL(self.location.href);
const APP_VERSION = swUrl.searchParams.get('v') || '0.0.0';
const BUILD_ID = swUrl.searchParams.get('b') || 'dev';

const CACHE_PREFIX = 'writevoid-v';
const STATIC_CACHE = CACHE_PREFIX + BUILD_ID + '-static';
const APP_SHELL = '/index.html';

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/theme.js?v=' + APP_VERSION + '&b=' + BUILD_ID,
    '/style.css?v=' + APP_VERSION + '&b=' + BUILD_ID,
    '/shared-diff.js?v=' + APP_VERSION + '&b=' + BUILD_ID,
    '/script.js?v=' + APP_VERSION + '&b=' + BUILD_ID,
    '/worker.js?v=' + APP_VERSION + '&b=' + BUILD_ID,
    '/favicon.svg'
];

self.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open(STATIC_CACHE).then(function (cache) {
            return cache.addAll(PRECACHE_URLS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', function (event) {
    event.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys
                    .filter(function (key) {
                        return key.startsWith(CACHE_PREFIX) && key !== STATIC_CACHE;
                    })
                    .map(function (key) {
                        return caches.delete(key);
                    })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

self.addEventListener('fetch', function (event) {
    const request = event.request;
    if (request.method !== 'GET') return;

    const requestUrl = new URL(request.url);
    if (requestUrl.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(function (response) {
                    const copy = response.clone();
                    caches.open(STATIC_CACHE).then(function (cache) {
                        cache.put(request, copy);
                    });
                    return response;
                })
                .catch(function () {
                    return caches.match(request).then(function (cached) {
                        return cached || caches.match(APP_SHELL);
                    });
                })
        );
        return;
    }

    if (requestUrl.pathname === '/sw.js') return;

    event.respondWith(
        caches.match(request).then(function (cached) {
            if (cached) return cached;
            return fetch(request).then(function (response) {
                if (response && response.ok) {
                    const copy = response.clone();
                    caches.open(STATIC_CACHE).then(function (cache) {
                        cache.put(request, copy);
                    });
                }
                return response;
            });
        })
    );
});
