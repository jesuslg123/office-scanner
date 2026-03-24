import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import App from './App'
import { mergeScannedItems, sortScannedItems } from './lib/items'
import type {
  BarcodeScanner,
  CreateBarcodeScanner,
  ScannedItem,
  ScannerRepository,
} from './types'

class MemoryRepository implements ScannerRepository {
  private items: ScannedItem[] = []

  async getAllItems() {
    return this.items
  }

  async upsertScan(
    barcode: string,
    tags: string[],
    comment = '',
    scannedAt = '2026-03-24T10:00:00.000Z',
  ) {
    const incoming: ScannedItem = {
      barcode,
      tags: [...new Set(tags)],
      comment,
      firstScannedAt: scannedAt,
      lastScannedAt: scannedAt,
      scanCount: 1,
    }
    const existing = this.items.find((item) => item.barcode === barcode)
    const nextItem = existing ? mergeScannedItems(existing, incoming) : incoming

    this.items = sortScannedItems(
      existing
        ? this.items.map((item) => (item.barcode === barcode ? nextItem : item))
        : [...this.items, nextItem],
    )

    return nextItem
  }

  async importItems(items: ScannedItem[]) {
    for (const item of items) {
      const existing = this.items.find((entry) => entry.barcode === item.barcode)
      const nextItem = existing ? mergeScannedItems(existing, item) : item

      this.items = sortScannedItems(
        existing
          ? this.items.map((entry) =>
              entry.barcode === item.barcode ? nextItem : entry,
            )
          : [...this.items, nextItem],
      )
    }
  }
}

function createMockScanner() {
  let detectedHandler: ((barcode: string) => void) | null = null
  let statusHandler: ((message: string | null) => void) | null = null

  const scanner: BarcodeScanner & { emit: (barcode: string) => void } = {
    async start(_videoElement, onDetected, onStatusChange) {
      detectedHandler = onDetected
      statusHandler = onStatusChange
      onStatusChange('Point the barcode inside the square frame.')
    },
    async focus() {
      return true
    },
    stop() {
      detectedHandler = null
      statusHandler = null
    },
    emit(barcode: string) {
      statusHandler?.(null)
      detectedHandler?.(barcode)
    },
  }

  return scanner
}

describe('App', () => {
  it('hides import and export actions behind the settings button', async () => {
    const repository = new MemoryRepository()
    const user = userEvent.setup()

    render(<App repository={repository} />)

    expect(
      screen.queryByRole('button', { name: 'Import CSV' }),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle settings' }))

    expect(screen.getByRole('button', { name: 'Import CSV' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()

    fireEvent.mouseDown(document.body)

    await waitFor(() => {
      expect(
        screen.queryByRole('button', { name: 'Import CSV' }),
      ).not.toBeInTheDocument()
    })
  })

  it('shows filters in a floating panel from the top bar', async () => {
    const repository = new MemoryRepository()
    const user = userEvent.setup()

    render(<App repository={repository} />)
    const filterToggle = screen.getByRole('button', { name: 'Toggle filters' })

    expect(
      screen.queryByRole('button', { name: 'Desk' }),
    ).not.toBeInTheDocument()

    await user.click(filterToggle)

    expect(screen.getByRole('button', { name: 'Desk' })).toBeInTheDocument()
    expect(screen.getByText('Workspace tags')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Desk' }))

    expect(filterToggle).toHaveClass('active')
    expect(within(filterToggle).getByText('1')).toBeInTheDocument()
  })

  it('opens scan mode and shows the tag dialog after a scan', async () => {
    const repository = new MemoryRepository()
    const scanner = createMockScanner()
    const createScanner: CreateBarcodeScanner = () => scanner
    const user = userEvent.setup()

    render(<App createScanner={createScanner} repository={repository} />)

    await user.click(screen.getByRole('button', { name: 'Open scanner' }))
    expect(
      screen.getByRole('dialog', { name: 'Barcode scanner' }),
    ).toBeInTheDocument()

    scanner.emit('12345')

    expect(
      await screen.findByRole('dialog', { name: 'Assign tags' }),
    ).toBeInTheDocument()
    expect(screen.getByText('12345')).toBeInTheDocument()

    fireEvent.mouseDown(document.querySelector('.dialog-backdrop') as Element)

    await waitFor(() => {
      expect(
        screen.queryByRole('dialog', { name: 'Assign tags' }),
      ).not.toBeInTheDocument()
    })
  })

  it('lets you switch between specific camera inputs in scan mode', async () => {
    const repository = new MemoryRepository()
    const user = userEvent.setup()
    const scanner: BarcodeScanner = {
      async start(_videoElement, _onDetected, onStatusChange) {
        onStatusChange(null)
      },
      async focus() {
        return true
      },
      stop() {},
    }
    const createScanner = vi.fn<CreateBarcodeScanner>().mockReturnValue(scanner)

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          {
            deviceId: 'wide-camera',
            groupId: 'rear',
            kind: 'videoinput',
            label: 'Back Camera Wide',
            toJSON() {
              return this
            },
          },
          {
            deviceId: 'tele-camera',
            groupId: 'rear',
            kind: 'videoinput',
            label: 'Back Camera Telephoto',
            toJSON() {
              return this
            },
          },
        ]),
      },
    })

    render(<App createScanner={createScanner} repository={repository} />)

    await user.click(screen.getByRole('button', { name: 'Open scanner' }))

    const cameraSelector = await screen.findByLabelText('Camera')
    expect(screen.getByRole('option', { name: 'Back Camera Wide' })).toBeInTheDocument()
    expect(
      screen.getByRole('option', { name: 'Back Camera Telephoto' }),
    ).toBeInTheDocument()

    await user.selectOptions(cameraSelector, 'tele-camera')

    await waitFor(() => {
      expect(createScanner).toHaveBeenLastCalledWith({ deviceId: 'tele-camera' })
    })
  })

  it('saves selected tags and updates the list', async () => {
    const repository = new MemoryRepository()
    const scanner = createMockScanner()
    const createScanner: CreateBarcodeScanner = () => scanner
    const user = userEvent.setup()

    render(<App createScanner={createScanner} repository={repository} />)

    await user.click(screen.getByRole('button', { name: 'Open scanner' }))
    scanner.emit('ABC-001')

    await user.click(await screen.findByRole('button', { name: 'Laptop' }))
    await user.type(screen.getByPlaceholderText('Add tags separated by commas'), 'urgent')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.type(screen.getByPlaceholderText('Add a note for this barcode'), 'Assigned to reception.')
    await user.click(screen.getByRole('button', { name: 'Save item' }))

    await waitFor(() => {
      expect(screen.getByText('ABC-001')).toBeInTheDocument()
    })
    expect(screen.getByText('Laptop')).toBeInTheDocument()
    expect(screen.getByText('urgent')).toBeInTheDocument()
    expect(screen.getByText('Assigned to reception.')).toBeInTheDocument()
  })

  it('imports csv data and reflects merged results', async () => {
    const repository = new MemoryRepository()
    const user = userEvent.setup()

    render(<App repository={repository} />)

    const input = document.querySelector('input[type="file"]')
    const file = new File(
      [
        'barcode,tags,comment,firstScannedAt,lastScannedAt,scanCount\n' +
          'XYZ-123,Desk|Monitor,Front office,2026-03-20T10:00:00.000Z,2026-03-24T10:00:00.000Z,2',
      ],
      'import.csv',
      { type: 'text/csv' },
    )

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [file] },
    })

    await waitFor(() => {
      expect(screen.getByText('XYZ-123')).toBeInTheDocument()
    })
    const savedItem = screen.getByText('XYZ-123').closest('li')

    expect(savedItem).not.toBeNull()
    expect(within(savedItem as HTMLLIElement).getByText('Desk')).toBeInTheDocument()
    expect(within(savedItem as HTMLLIElement).getByText('Monitor')).toBeInTheDocument()
    expect(within(savedItem as HTMLLIElement).getByText('Front office')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Toggle filters' }))
    await user.click(screen.getByRole('button', { name: 'Desk' }))

    expect(screen.getByText('XYZ-123')).toBeInTheDocument()
  })
})
