// Check if a URL exists in the browser Cache API.
export async function isUrlCached(url: string): Promise<boolean> {
  if (typeof window === 'undefined' || !('caches' in window)) {
    return false;
  }

  try {
    const cache = await caches.open('cnblocks-iframe-cache-v1');
    const cachedResponse = await cache.match(url);
    return cachedResponse !== undefined;
  } catch (error) {
    console.error('Error checking cache:', error);
    return false;
  }
}
