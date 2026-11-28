// Separate from board documents, exported shapes, chat archives and backups.
// This is device storage, not protection from compromised same-origin code.
const dbName = 'oneworker-whiteboard-device-keys';
const storeName = 'credentials';
type RecordValue = { wrappingKey: CryptoKey; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer };

async function access<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(storeName);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const req = run(tx.objectStore(storeName));
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('device storage unavailable'));
    });
  } finally {
    db.close();
  }
}

export async function loadDeviceKey(owner: string) {
  const record: RecordValue | undefined = await access('readonly', store => store.get(owner));
  if (!record) return '';
  const bytes = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: record.iv, additionalData: new TextEncoder().encode(owner),
  }, record.wrappingKey, record.data);
  return new TextDecoder().decode(bytes);
}

export async function rememberDeviceKey(owner: string, value: string) {
  const wrappingKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({
    name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(owner),
  }, wrappingKey, new TextEncoder().encode(value));
  await access('readwrite', store => store.put({ wrappingKey, iv, data }, owner));
}

export async function forgetDeviceKey(owner: string) {
  await access('readwrite', store => store.delete(owner));
}
