import type { ScannedItem } from '../types'

export function normalizeBarcode(value: string): string {
  return value.trim()
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  )
}

export function createScannedItem(
  barcode: string,
  tags: string[],
  scannedAt: string,
): ScannedItem {
  return {
    barcode: normalizeBarcode(barcode),
    tags: normalizeTags(tags),
    firstScannedAt: scannedAt,
    lastScannedAt: scannedAt,
    scanCount: 1,
  }
}

export function normalizeScannedItem(item: ScannedItem): ScannedItem {
  return {
    ...item,
    barcode: normalizeBarcode(item.barcode),
    tags: normalizeTags(item.tags),
  }
}

export function mergeScannedItems(
  existing: ScannedItem,
  incoming: ScannedItem,
): ScannedItem {
  return {
    barcode: existing.barcode,
    tags: normalizeTags([...existing.tags, ...incoming.tags]),
    firstScannedAt:
      new Date(existing.firstScannedAt).getTime() <=
      new Date(incoming.firstScannedAt).getTime()
        ? existing.firstScannedAt
        : incoming.firstScannedAt,
    lastScannedAt:
      new Date(existing.lastScannedAt).getTime() >=
      new Date(incoming.lastScannedAt).getTime()
        ? existing.lastScannedAt
        : incoming.lastScannedAt,
    scanCount: existing.scanCount + incoming.scanCount,
  }
}

export function filterItemsByTags(
  items: ScannedItem[],
  activeTags: string[],
): ScannedItem[] {
  if (activeTags.length === 0) {
    return items
  }

  return items.filter((item) =>
    item.tags.some((tag) => activeTags.includes(tag)),
  )
}

export function sortScannedItems(items: ScannedItem[]): ScannedItem[] {
  return [...items].sort((left, right) => {
    const lastScanDelta =
      new Date(right.lastScannedAt).getTime() -
      new Date(left.lastScannedAt).getTime()

    if (lastScanDelta !== 0) {
      return lastScanDelta
    }

    return left.barcode.localeCompare(right.barcode)
  })
}
