import { describe, expect, it } from 'vitest'

import {
  filterItems,
  filterItemsByTags,
  mergeScannedItems,
  sortScannedItems,
  toDateInputValue,
} from './items'

describe('items helpers', () => {
  it('merges duplicate barcodes by unioning tags and counts', () => {
    const merged = mergeScannedItems(
      {
        barcode: '12345',
        tags: ['desk'],
        comment: '',
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-20T10:00:00.000Z',
        scanCount: 1,
      },
      {
        barcode: '12345',
        tags: ['monitor', 'desk'],
        comment: 'Corner office',
        firstScannedAt: '2026-03-24T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 1,
      },
    )

    expect(merged.tags).toEqual(['desk', 'monitor'])
    expect(merged.comment).toBe('Corner office')
    expect(merged.firstScannedAt).toBe('2026-03-20T10:00:00.000Z')
    expect(merged.lastScannedAt).toBe('2026-03-24T10:00:00.000Z')
    expect(merged.scanCount).toBe(2)
  })

  it('filters using match-any tag logic', () => {
    const items = [
      {
        barcode: 'AAA',
        tags: ['desk'],
        comment: '',
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-20T10:00:00.000Z',
        scanCount: 1,
      },
      {
        barcode: 'BBB',
        tags: ['monitor'],
        comment: '',
        firstScannedAt: '2026-03-21T10:00:00.000Z',
        lastScannedAt: '2026-03-21T10:00:00.000Z',
        scanCount: 1,
      },
    ]

    expect(filterItemsByTags(items, ['desk', 'chair'])).toEqual([items[0]])
  })

  it('filters using the last scan date as the DATE reference', () => {
    const items = [
      {
        barcode: 'AAA',
        tags: ['desk'],
        comment: '',
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-20T10:00:00.000Z',
        scanCount: 1,
      },
      {
        barcode: 'BBB',
        tags: ['monitor'],
        comment: '',
        firstScannedAt: '2026-03-21T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 1,
      },
    ]

    expect(
      filterItems(items, [
        {
          type: 'DATE',
          reference: 'lastScannedAt',
          mode: 'date',
          value: toDateInputValue(items[1].lastScannedAt),
        },
      ]),
    ).toEqual([items[1]])
  })

  it('filters using an inclusive last scan date range', () => {
    const items = [
      {
        barcode: 'AAA',
        tags: ['desk'],
        comment: '',
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-20T10:00:00.000Z',
        scanCount: 1,
      },
      {
        barcode: 'BBB',
        tags: ['monitor'],
        comment: '',
        firstScannedAt: '2026-03-21T10:00:00.000Z',
        lastScannedAt: '2026-03-22T10:00:00.000Z',
        scanCount: 1,
      },
      {
        barcode: 'CCC',
        tags: ['chair'],
        comment: '',
        firstScannedAt: '2026-03-23T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 1,
      },
    ]

    expect(
      filterItems(items, [
        {
          type: 'DATE',
          reference: 'lastScannedAt',
          mode: 'range',
          start: toDateInputValue(items[1].lastScannedAt),
          end: toDateInputValue(items[2].lastScannedAt),
        },
      ]),
    ).toEqual([items[1], items[2]])
  })

  it('sorts most recent scans first', () => {
    const sorted = sortScannedItems([
      {
        barcode: 'AAA',
        tags: [],
        comment: '',
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-20T10:00:00.000Z',
        scanCount: 1,
      },
      {
        barcode: 'BBB',
        tags: [],
        comment: '',
        firstScannedAt: '2026-03-24T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 1,
      },
    ])

    expect(sorted.map((item) => item.barcode)).toEqual(['BBB', 'AAA'])
  })
})
