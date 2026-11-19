import { validateDocument } from './model';
import type { AssetRecord, BoardDocument } from './types';

/** Deliberately separate from the previous whiteboard's localStorage records. */
const DATABASE = 'oneworker-whiteboard-v2';
export const MAX_ASSET_BYTES = 32 * 1024 * 1024;
export const MAX_BUNDLE_ASSET_BYTES = 64 * 1024 * 1024;
let databasePromise: Promise<IDBDatabase> | undefined;
const saveQueues = new Map<string, Promise<void>>();

function database(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(
      new Error('当前浏览器无法使用本地数据库，白板尚未保存。')
    );
  }
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('documents'))
        db.createObjectStore('documents', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('assets'))
        db.createObjectStore('assets', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      if (blocked) {
        db.close();
        return;
      }
      db.onversionchange = () => {
        db.close();
        databasePromise = undefined;
      };
      resolve(db);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(
        new Error(`打开白板数据库失败：${request.error?.message ?? '未知错误'}`)
      );
    };
    request.onblocked = () => {
      blocked = true;
      databasePromise = undefined;
      reject(new Error('白板数据库被其他窗口阻塞，请关闭旧窗口后重试。'));
    };
  });
  return databasePromise;
}

async function readRecord<T>(
  store: string,
  key: string
): Promise<T | undefined> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const request = tx.objectStore(store).get(key);
    let result: T | undefined;
    request.onsuccess = () => {
      result = request.result as T | undefined;
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(`读取白板数据失败：${tx.error?.message ?? '事务已中止'}`)
      );
  });
}

async function writeRecords(store: string, records: unknown[]): Promise<void> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          `保存白板数据失败（请检查磁盘空间和浏览器权限）：${tx.error?.message ?? '事务已中止'}`
        )
      );
    try {
      for (const record of records) tx.objectStore(store).put(record);
    } catch (error) {
      tx.abort();
      reject(error);
    }
  });
}

/** Reject temporary object URLs instead of silently saving broken media references. */
export function assertPersistentResources(doc: BoardDocument): void {
  for (const page of doc.pages) {
    for (const shape of page.shapes) {
      for (const field of ['src', 'image', 'url'] as const) {
        if (
          typeof shape.props[field] === 'string' &&
          shape.props[field].trim().startsWith('blob:')
        ) {
          throw new Error('临时媒体地址不能保存，请先将媒体导入白板资源库。');
        }
      }
    }
  }
}

export async function loadBoard(key: string): Promise<BoardDocument | null> {
  await saveQueues.get(key)?.catch(() => undefined);
  const record = await readRecord<{ key: string; document: unknown }>(
    'documents',
    key
  );
  return record ? validateDocument(record.document) : null;
}

/** Snapshot at call time; writes for a board can never overtake each other. */
export async function saveBoard(
  key: string,
  document: BoardDocument
): Promise<void> {
  if (!key || key.length > 512) throw new Error('白板存储标识无效。');
  const snapshot = validateDocument(document);
  assertPersistentResources(snapshot);
  const previous = saveQueues.get(key) ?? Promise.resolve();
  const pending = previous
    .catch(() => undefined)
    .then(() =>
      writeRecords('documents', [
        { key, document: snapshot, updatedAt: Date.now() },
      ])
    );
  saveQueues.set(key, pending);
  try {
    await pending;
  } finally {
    if (saveQueues.get(key) === pending) saveQueues.delete(key);
  }
}

export function newAssetId(): string {
  return `asset_${crypto.randomUUID()}`;
}

export function validateAsset(record: AssetRecord): void {
  if (!(record.blob instanceof Blob) || record.blob.size === 0)
    throw new Error('媒体文件为空或无效。');
  if (record.blob.size > MAX_ASSET_BYTES)
    throw new Error('单个媒体文件不能超过 32 MiB。');
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(record.id))
    throw new Error('媒体资源标识无效。');
  if (!record.name || record.name.length > 1024)
    throw new Error('媒体文件名称无效。');
  if (
    !/^(image|video)\/[a-zA-Z0-9.+-]+$/.test(record.mimeType) ||
    record.blob.type !== record.mimeType
  ) {
    throw new Error('白板仅接受已标识类型的图片或视频文件。');
  }
}

/** One transaction means a portable import cannot leave a partially written bundle. */
export async function storeAssetRecords(records: AssetRecord[]): Promise<void> {
  let size = 0;
  for (const record of records) {
    validateAsset(record);
    size += record.blob.size;
  }
  if (size > MAX_BUNDLE_ASSET_BYTES)
    throw new Error('白板媒体总量超过 64 MiB 导入限制。');
  if (records.length) await writeRecords('assets', records);
}

export async function putAsset(blob: Blob, name: string): Promise<AssetRecord> {
  const record: AssetRecord = {
    id: newAssetId(),
    blob,
    name,
    mimeType: blob.type,
  };
  await storeAssetRecords([record]);
  return record;
}

export function getAsset(id: string): Promise<AssetRecord | undefined> {
  return readRecord<AssetRecord>('assets', id);
}
