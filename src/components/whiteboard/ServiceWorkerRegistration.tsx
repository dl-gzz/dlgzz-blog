'use client';

import { useEffect } from 'react';

export default function ServiceWorkerRegistration() {
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('[PWA] Service Worker registered:', registration.scope);
                    // Auto update when new SW is available
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (newWorker) {
                            newWorker.addEventListener('statechange', () => {
                                if (
                                    newWorker.state === 'activated' &&
                                    navigator.serviceWorker.controller
                                ) {
                                    // New version available, reload to activate
                                    window.location.reload();
                                }
                            });
                        }
                    });
                })
                .catch((err) => {
                    console.error('[PWA] Service Worker registration failed:', err);
                });
        }
    }, []);

    return null;
}
