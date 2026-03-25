import type { DateFilter, ItemFilter, ScannedItem } from '../types'

export function normalizeBarcode(value: string): string {
  return value.trim()
}

export function normalizeTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))].sort(
    (left, right) => left.localeCompare(right),
  )
}

export function normalizeComment(value?: string | null): string {
  return value?.trim() ?? ''
}

export function createScannedItem(
  barcode: string,
  tags: string[],
  comment: string,
  scannedAt: string,
): ScannedItem {
  return {
    barcode: normalizeBarcode(barcode),
    tags: normalizeTags(tags),
    comment: normalizeComment(comment),
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
    comment: normalizeComment(item.comment),
  }
}

export function mergeScannedItems(
  existing: ScannedItem,
  incoming: ScannedItem,
): ScannedItem {
  return {
    barcode: existing.barcode,
    tags: normalizeTags([...existing.tags, ...incoming.tags]),
    comment: normalizeComment(incoming.comment) || existing.comment,
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
  return filterItems(
    items,
    activeTags.length === 0 ? [] : [{ type: 'TAG', values: activeTags }],
  )
}

export function toDateInputValue(value: string): string {
  const date = new Date(value)
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function matchesDateFilter(item: ScannedItem, filter: DateFilter): boolean {
  const lastScannedDate = toDateInputValue(item.lastScannedAt)

  if (filter.mode === 'date') {
    return lastScannedDate === filter.value
  }

  return lastScannedDate >= filter.start && lastScannedDate <= filter.end
}

export function filterItems(
  items: ScannedItem[],
  filters: ItemFilter[],
): ScannedItem[] {
  if (filters.length === 0) {
    return items
  }

  return items.filter((item) =>
    filters.every((filter) => {
      if (filter.type === 'TAG') {
        return filter.values.some((tag) => item.tags.includes(tag))
      }

      return matchesDateFilter(item, filter)
    }),
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
