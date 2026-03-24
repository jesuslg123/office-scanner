import { describe, expect, it } from 'vitest'

import { exportItemsToCsv, parseItemsFromCsv } from './csv'

describe('csv service', () => {
  it('round-trips items through csv export and import', () => {
    const csv = exportItemsToCsv([
      {
        barcode: '12345',
        tags: ['desk', 'monitor'],
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 3,
      },
    ])
    const parsed = parseItemsFromCsv(csv)

    expect(parsed.errors).toEqual([])
    expect(parsed.items).toEqual([
      {
        barcode: '12345',
        tags: ['desk', 'monitor'],
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 3,
      },
    ])
  })

  it('skips invalid rows and keeps valid ones', () => {
    const parsed = parseItemsFromCsv(`barcode,tags,firstScannedAt,lastScannedAt,scanCount
111,desk,2026-03-20T10:00:00.000Z,2026-03-24T10:00:00.000Z,2
222,monitor,bad-date,2026-03-24T10:00:00.000Z,1`)

    expect(parsed.items).toEqual([
      {
        barcode: '111',
        tags: ['desk'],
        firstScannedAt: '2026-03-20T10:00:00.000Z',
        lastScannedAt: '2026-03-24T10:00:00.000Z',
        scanCount: 2,
      },
    ])
    expect(parsed.errors).toEqual(['Row 3: timestamps must be valid ISO dates.'])
  })
})
