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
  TagDraft,
  TagOption,
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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
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
  const existingComment = taggingBarcode
    ? items.find((item) => item.barcode === taggingBarcode)?.comment ?? ''
    : ''
  const availableFilterTags: TagOption[] = [
    ...new Map(
      [...preloadedTags.map((tag) => tag.label), ...items.flatMap((item) => item.tags)]
        .sort((left, right) => left.localeCompare(right))
        .map((label) => [label, { id: label, label }]),
    ).values(),
  ]

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

  const handleSaveTags = async ({ tags, comment }: TagDraft) => {
    if (!taggingBarcode) {
      return
    }

    await repository.upsertScan(taggingBarcode, tags, comment)
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
        <section className="top-bar">
          <div className="top-bar-layout">
            <div className="top-bar-filters">
              <button
                aria-expanded={filtersOpen}
                aria-label="Toggle filters"
                className={`icon-button settings-trigger filter-trigger ${
                  activeFilters.length > 0 ? 'active' : ''
                }`}
                onClick={() => setFiltersOpen((current) => !current)}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="icon-svg"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M3 5.5C3 4.67 3.67 4 4.5 4h15a1.5 1.5 0 0 1 1.14 2.48L15 13.17V18a1 1 0 0 1-.55.9l-4 2A1 1 0 0 1 9 20v-6.83L3.36 6.48A1.5 1.5 0 0 1 3 5.5Z"
                    fill="currentColor"
                  />
                </svg>
                {activeFilters.length > 0 ? (
                  <span className="filter-count-badge">{activeFilters.length}</span>
                ) : null}
              </button>
              {filtersOpen ? (
                <div className="floating-panel filter-panel">
                  <div className="floating-panel-header">
                    <div>
                      <p className="eyebrow">Filter by tag</p>
                      <h2>Workspace tags</h2>
                    </div>
                    {activeFilters.length > 0 ? (
                      <button
                        className="secondary-button clear-button"
                        onClick={() => setActiveFilters([])}
                        type="button"
                      >
                        Clear
                      </button>
                    ) : null}
                  </div>
                  <div className="tag-row">
                    {availableFilterTags.map((tag) => {
                      const isActive = activeFilters.includes(tag.label)

                      return (
                        <button
                          aria-pressed={isActive}
                          className={`tag-chip ${isActive ? 'active' : ''}`}
                          key={tag.id}
                          onClick={() => handleToggleFilter(tag.label)}
                          type="button"
                        >
                          {tag.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <h1 className="top-bar-title">Office Scanner</h1>
            <div className="top-bar-settings">
              <button
                aria-expanded={settingsOpen}
                aria-label="Toggle settings"
                className="icon-button settings-trigger"
                onClick={() => setSettingsOpen((current) => !current)}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  className="icon-svg"
                  viewBox="0 0 24 24"
                >
                  <path
                    d="M19.14 12.94a7.96 7.96 0 0 0 .05-.94 7.96 7.96 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.28 7.28 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54a7.28 7.28 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.7 8.48a.5.5 0 0 0 .12.64l2.03 1.58a7.96 7.96 0 0 0-.05.94c0 .32.02.63.05.94L2.82 14.16a.5.5 0 0 0-.12.64l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54a.5.5 0 0 0 .49.42h3.8a.5.5 0 0 0 .49-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
              {settingsOpen ? (
                <div className="toolbar floating-panel settings-panel">
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
              ) : null}
            </div>
          </div>
        </section>
        <input
          accept=".csv,text/csv"
          className="hidden-input"
          onChange={(event) => void handleImportFile(event)}
          ref={fileInputRef}
          type="file"
        />
        {notice ? <p className="notice-banner">{notice}</p> : null}

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
                      item.tags.map((tag) => (
                        <span className="item-tag" key={`${item.barcode}-${tag}`}>
                          {tag}
                        </span>
                      ))
                    )}
                  </div>
                  {item.comment ? <p className="item-comment">{item.comment}</p> : null}
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
        initialComment={existingComment}
        initialSelectedTags={existingTagSelection}
        onCancel={handleCancelTagging}
        onSave={handleSaveTags}
        open={Boolean(taggingBarcode)}
      />
    </div>
  )
}
