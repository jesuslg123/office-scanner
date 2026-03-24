import { openDB } from 'idb'

import {
  createScannedItem,
  mergeScannedItems,
  normalizeBarcode,
  normalizeScannedItem,
} from '../lib/items'
import type { ScannedItem, ScannerRepository } from '../types'

const DB_VERSION = 1
const STORE_NAME = 'items'
export const DEFAULT_DB_NAME = 'office-scanner'

type ScannerDatabase = {
  items: {
    key: string
    value: ScannedItem
  }
}

async function openScannerDb(dbName: string) {
  return openDB<ScannerDatabase>(dbName, DB_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'barcode' })
      }
    },
  })
}

class IndexedDbScannerRepository implements ScannerRepository {
  private readonly dbPromise: ReturnType<typeof openScannerDb>

  constructor(dbName: string) {
    this.dbPromise = openScannerDb(dbName)
  }

  async getAllItems(): Promise<ScannedItem[]> {
    const database = await this.dbPromise
    const items = await database.getAll(STORE_NAME)
    return items.map(normalizeScannedItem)
  }

  async upsertScan(
    barcode: string,
    tags: string[],
    comment = '',
    scannedAt = new Date().toISOString(),
  ): Promise<ScannedItem> {
    const normalizedBarcode = normalizeBarcode(barcode)

    if (!normalizedBarcode) {
      throw new Error('Barcode value is required.')
    }

    const database = await this.dbPromise
    const existing = await database.get(STORE_NAME, normalizedBarcode)
    const incoming = createScannedItem(normalizedBarcode, tags, comment, scannedAt)
    const nextItem = existing ? mergeScannedItems(existing, incoming) : incoming

    await database.put(STORE_NAME, nextItem)

    return nextItem
  }

  async deleteItem(barcode: string): Promise<void> {
    const normalizedBarcode = normalizeBarcode(barcode)

    if (!normalizedBarcode) {
      throw new Error('Barcode value is required.')
    }

    const database = await this.dbPromise
    await database.delete(STORE_NAME, normalizedBarcode)
  }

  async importItems(items: ScannedItem[]): Promise<void> {
    const database = await this.dbPromise
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)

    for (const item of items) {
      const normalized = normalizeScannedItem(item)

      if (!normalized.barcode) {
        continue
      }

      const existing = await store.get(normalized.barcode)
      const nextItem = existing
        ? mergeScannedItems(existing, normalized)
        : normalized

      await store.put(nextItem)
    }

    await transaction.done
  }
}

export function createScannerRepository(
  dbName = DEFAULT_DB_NAME,
): ScannerRepository {
  return new IndexedDbScannerRepository(dbName)
}

export async function deleteScannerDatabase(
  dbName = DEFAULT_DB_NAME,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)

    request.onerror = () => {
      reject(request.error ?? new Error(`Unable to delete ${dbName}.`))
    }
    request.onsuccess = () => {
      resolve()
    }
    request.onblocked = () => {
      reject(new Error(`Deletion blocked for ${dbName}.`))
    }
  })
}
