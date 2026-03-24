import { beforeEach, describe, expect, it } from 'vitest'

import {
  createScannerRepository,
  deleteScannerDatabase,
} from './repository'

describe('scanner repository', () => {
  const dbName = 'scanner-repository-test'

  beforeEach(async () => {
    await deleteScannerDatabase(dbName)
  })

  it('merges repeat scans into one stored item', async () => {
    const repository = createScannerRepository(dbName)

    await repository.upsertScan(
      '12345',
      ['desk'],
      'Docking station shelf',
      '2026-03-20T10:00:00.000Z',
    )
    await repository.upsertScan(
      '12345',
      ['monitor'],
      'Updated setup',
      '2026-03-24T10:00:00.000Z',
    )

    const items = await repository.getAllItems()

    expect(items).toHaveLength(1)
    expect(items[0]).toEqual({
      barcode: '12345',
      tags: ['desk', 'monitor'],
      comment: 'Updated setup',
      firstScannedAt: '2026-03-20T10:00:00.000Z',
      lastScannedAt: '2026-03-24T10:00:00.000Z',
      scanCount: 2,
    })
  })
})
