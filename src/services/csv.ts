import Papa from 'papaparse'

import {
  mergeScannedItems,
  normalizeBarcode,
  normalizeScannedItem,
  normalizeTags,
  sortScannedItems,
} from '../lib/items'
import type { CsvParseResult, CsvRow, ScannedItem } from '../types'

const CSV_COLUMNS = [
  'barcode',
  'tags',
  'firstScannedAt',
  'lastScannedAt',
  'scanCount',
] as const

function parseDate(value: string): string | null {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed.toISOString()
}

function parseScanCount(value: string): number | null {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }

  return parsed
}

function getRowLabel(index: number): string {
  return `Row ${index + 2}`
}

export function exportItemsToCsv(items: ScannedItem[]): string {
  const rows: CsvRow[] = sortScannedItems(items).map((item) => ({
    barcode: item.barcode,
    tags: item.tags.join('|'),
    firstScannedAt: item.firstScannedAt,
    lastScannedAt: item.lastScannedAt,
    scanCount: item.scanCount,
  }))

  return Papa.unparse(rows, {
    columns: [...CSV_COLUMNS],
  })
}

export function parseItemsFromCsv(csvText: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  })

  const availableColumns = parsed.meta.fields ?? []
  const missingColumns = CSV_COLUMNS.filter(
    (column) => !availableColumns.includes(column),
  )

  if (missingColumns.length > 0) {
    return {
      items: [],
      errors: [
        `Missing required columns: ${missingColumns.join(', ')}.`,
      ],
    }
  }

  const mergedItems = new Map<string, ScannedItem>()
  const errors: string[] = []

  parsed.data.forEach((row, index) => {
    const barcode = normalizeBarcode(row.barcode ?? '')
    const tags = normalizeTags((row.tags ?? '').split('|'))
    const firstScannedAt = parseDate(row.firstScannedAt ?? '')
    const lastScannedAt = parseDate(row.lastScannedAt ?? '')
    const scanCount = parseScanCount(row.scanCount ?? '')
    const rowLabel = getRowLabel(index)

    if (!barcode) {
      errors.push(`${rowLabel}: barcode is required.`)
      return
    }

    if (!firstScannedAt || !lastScannedAt) {
      errors.push(`${rowLabel}: timestamps must be valid ISO dates.`)
      return
    }

    if (new Date(lastScannedAt).getTime() < new Date(firstScannedAt).getTime()) {
      errors.push(`${rowLabel}: lastScannedAt cannot be earlier than firstScannedAt.`)
      return
    }

    if (!scanCount) {
      errors.push(`${rowLabel}: scanCount must be a positive integer.`)
      return
    }

    const nextItem = normalizeScannedItem({
      barcode,
      tags,
      firstScannedAt,
      lastScannedAt,
      scanCount,
    })
    const existing = mergedItems.get(barcode)

    mergedItems.set(
      barcode,
      existing ? mergeScannedItems(existing, nextItem) : nextItem,
    )
  })

  return {
    items: sortScannedItems([...mergedItems.values()]),
    errors,
  }
}
