import { describe, expect, it } from 'vitest'

import { createScannerRepository } from './repository'

function createTestDbName() {
  return `scanner-repository-test-${Math.random().toString(36).slice(2)}`
}

describe('scanner repository', () => {
  it('merges repeat scans into one stored item', async () => {
    const dbName = createTestDbName()
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

  it('deletes a stored item by barcode', async () => {
    const dbName = createTestDbName()
    const repository = createScannerRepository(dbName)

    await repository.upsertScan(
      '12345',
      ['desk'],
      'Docking station shelf',
      '2026-03-20T10:00:00.000Z',
    )
    await repository.deleteItem('12345')

    await expect(repository.getAllItems()).resolves.toEqual([])
  })
})
