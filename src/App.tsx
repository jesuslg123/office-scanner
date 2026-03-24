import {
  type ChangeEvent,
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from 'react'

import './App.css'
import { ScanSheet } from './components/ScanSheet'
import { TagDialog } from './components/TagDialog'
import { preloadedTags } from './data/preloadedTags'
import { formatDateTime } from './lib/format'
import { filterItemsByTags, sortScannedItems } from './lib/items'
import { exportItemsToCsv, parseItemsFromCsv } from './services/csv'
import { exportCsvFile } from './services/fileTransfer'
import { createScannerRepository } from './services/repository'
import { createBarcodeScanner } from './services/scanner'
import type {
  CreateBarcodeScanner,
  ScannedItem,
  ScannerRepository,
} from './types'

const defaultRepository = createScannerRepository()

type AppProps = {
  repository?: ScannerRepository
  createScanner?: CreateBarcodeScanner
}

export default function App({
  repository = defaultRepository,
  createScanner = createBarcodeScanner,
}: AppProps) {
  const [items, setItems] = useState<ScannedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [pausedBarcode, setPausedBarcode] = useState<string | null>(null)
  const [taggingBarcode, setTaggingBarcode] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const deferredFilters = useDeferredValue(activeFilters)

  useEffect(() => {
    let isMounted = true

    const loadItems = async () => {
      try {
        const storedItems = await repository.getAllItems()

        if (!isMounted) {
          return
        }

        startTransition(() => {
          setItems(sortScannedItems(storedItems))
          setLoading(false)
        })
      } catch (error) {
        if (!isMounted) {
          return
        }

        setNotice(
          error instanceof Error
            ? error.message
            : 'Unable to load stored items.',
        )
        setLoading(false)
      }
    }

    void loadItems()

    return () => {
      isMounted = false
    }
  }, [repository])

  const refreshItems = async () => {
    const storedItems = await repository.getAllItems()
    startTransition(() => {
      setItems(sortScannedItems(storedItems))
    })
  }

  const filteredItems = filterItemsByTags(items, deferredFilters)
  const existingTagSelection = taggingBarcode
    ? items.find((item) => item.barcode === taggingBarcode)?.tags ?? []
    : []

  const handleToggleFilter = (tagId: string) => {
    setActiveFilters((current) =>
      current.includes(tagId)
        ? current.filter((value) => value !== tagId)
        : [...current, tagId],
    )
  }

  const handleDetected = (barcode: string) => {
    setNotice(null)
    setPausedBarcode(barcode)
    setTaggingBarcode(barcode)
  }

  const handleSaveTags = async (tags: string[]) => {
    if (!taggingBarcode) {
      return
    }

    await repository.upsertScan(taggingBarcode, tags)
    await refreshItems()
    setNotice(`Saved ${taggingBarcode}.`)
    setTaggingBarcode(null)
  }

  const handleCancelTagging = () => {
    setTaggingBarcode(null)
    setPausedBarcode(null)
  }

  const handleCloseScanner = () => {
    setPausedBarcode(null)
    setTaggingBarcode(null)
    setScanOpen(false)
  }

  const handleScanAnother = () => {
    setPausedBarcode(null)
    setTaggingBarcode(null)
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    setIsImporting(true)
    setNotice(null)

    try {
      const csvText =
        typeof file.text === 'function'
          ? await file.text()
          : await new Promise<string>((resolve, reject) => {
              const reader = new FileReader()

              reader.onerror = () => {
                reject(reader.error ?? new Error('Unable to read this file.'))
              }
              reader.onload = () => {
                resolve(String(reader.result ?? ''))
              }
              reader.readAsText(file)
            })
      const { items: importedItems, errors } = parseItemsFromCsv(csvText)

      if (importedItems.length > 0) {
        await repository.importItems(importedItems)
        await refreshItems()
      }

      if (errors.length > 0 && importedItems.length > 0) {
        setNotice(
          `Imported ${importedItems.length} items. Skipped ${errors.length} invalid row(s).`,
        )
      } else if (errors.length > 0) {
        setNotice(errors.join(' '))
      } else {
        setNotice(`Imported ${importedItems.length} items.`)
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to import this file.',
      )
    } finally {
      event.target.value = ''
      setIsImporting(false)
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    setNotice(null)

    try {
      const csv = exportItemsToCsv(items)
      const fileName = `scanner-export-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`

      await exportCsvFile(fileName, csv)
      setNotice(`Exported ${items.length} items.`)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Unable to export CSV.',
      )
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="app-shell">
      <main className="app-frame">
        <section className="hero-panel">
          <p className="eyebrow">Office inventory scanner</p>
          <div className="hero-row">
            <div>
              <h1>Scan and organize barcodes offline.</h1>
              <p className="hero-copy">
                Capture office equipment with the camera, tag each barcode, and
                keep everything saved locally on the device.
              </p>
            </div>
            <div className="toolbar">
              <button
                className="secondary-button"
                disabled={isImporting}
                onClick={handleImportClick}
                type="button"
              >
                {isImporting ? 'Importing...' : 'Import CSV'}
              </button>
              <button
                className="primary-button"
                disabled={isExporting || items.length === 0}
                onClick={() => void handleExport()}
                type="button"
              >
                {isExporting ? 'Exporting...' : 'Export CSV'}
              </button>
            </div>
          </div>
          <input
            accept=".csv,text/csv"
            className="hidden-input"
            onChange={(event) => void handleImportFile(event)}
            ref={fileInputRef}
            type="file"
          />
          {notice ? <p className="notice-banner">{notice}</p> : null}
        </section>

        <section className="content-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Filter by tag</p>
              <h2>Workspace tags</h2>
            </div>
            <span className="count-pill">{filteredItems.length} items</span>
          </div>
          <div className="tag-row">
            {preloadedTags.map((tag) => {
              const isActive = activeFilters.includes(tag.id)

              return (
                <button
                  aria-pressed={isActive}
                  className={`tag-chip ${isActive ? 'active' : ''}`}
                  key={tag.id}
                  onClick={() => handleToggleFilter(tag.id)}
                  type="button"
                >
                  {tag.label}
                </button>
              )
            })}
          </div>
        </section>

        <section className="content-panel list-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Scanned inventory</p>
              <h2>Saved barcodes</h2>
            </div>
          </div>

          {loading ? (
            <p className="empty-state">Loading saved barcodes...</p>
          ) : filteredItems.length === 0 ? (
            <div className="empty-state">
              <strong>No scanned items yet.</strong>
              <p>Use the scan button to capture a barcode and assign tags.</p>
            </div>
          ) : (
            <ul className="item-list">
              {filteredItems.map((item) => (
                <li className="item-card" key={item.barcode}>
                  <div className="item-topline">
                    <strong>{item.barcode}</strong>
                    <span className="count-pill">{item.scanCount} scans</span>
                  </div>
                  <div className="tag-row compact">
                    {item.tags.length === 0 ? (
                      <span className="empty-tag">No tags</span>
                    ) : (
                      item.tags.map((tagId) => {
                        const tagLabel =
                          preloadedTags.find((tag) => tag.id === tagId)?.label ??
                          tagId

                        return (
                          <span className="item-tag" key={`${item.barcode}-${tagId}`}>
                            {tagLabel}
                          </span>
                        )
                      })
                    )}
                  </div>
                  <p className="item-meta">
                    First scanned {formatDateTime(item.firstScannedAt)}
                  </p>
                  <p className="item-meta">
                    Last scanned {formatDateTime(item.lastScannedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <button
        aria-label="Open scanner"
        className="scan-fab"
        onClick={() => {
          setNotice(null)
          setPausedBarcode(null)
          setScanOpen(true)
        }}
        type="button"
      >
        Scan
      </button>

      <ScanSheet
        createScanner={createScanner}
        onClose={handleCloseScanner}
        onDetected={handleDetected}
        onScanAnother={handleScanAnother}
        open={scanOpen}
        pausedBarcode={pausedBarcode && !taggingBarcode ? pausedBarcode : null}
      />

      <TagDialog
        availableTags={preloadedTags}
        barcode={taggingBarcode}
        initialSelectedTags={existingTagSelection}
        onCancel={handleCancelTagging}
        onSave={handleSaveTags}
        open={Boolean(taggingBarcode)}
      />
    </div>
  )
}
