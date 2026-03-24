import { useEffect, useEffectEvent, useRef, useState } from 'react'

import type { CreateBarcodeScanner } from '../types'

type ScanSheetProps = {
  open: boolean
  pausedBarcode: string | null
  createScanner: CreateBarcodeScanner
  onClose: () => void
  onDetected: (barcode: string) => void
  onScanAnother: () => void
}

export function ScanSheet({
  open,
  pausedBarcode,
  createScanner,
  onClose,
  onDetected,
  onScanAnother,
}: ScanSheetProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scannerRef = useRef<ReturnType<CreateBarcodeScanner> | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleDetected = useEffectEvent(onDetected)

  useEffect(() => {
    if (!open) {
      scannerRef.current?.stop()
      scannerRef.current = null
      return
    }

    if (pausedBarcode || !videoRef.current) {
      scannerRef.current?.stop()
      scannerRef.current = null
      return
    }

    const scanner = createScanner()
    scannerRef.current = scanner
    void scanner.start(videoRef.current, handleDetected, setStatusMessage)

    return () => {
      scanner.stop()
      scannerRef.current = null
    }
  }, [createScanner, open, pausedBarcode])

  if (!open) {
    return null
  }

  return (
    <div className="sheet-backdrop" role="presentation">
      <section
        aria-labelledby="scan-sheet-title"
        aria-modal="true"
        className="scan-sheet"
        role="dialog"
      >
        <div className="sheet-header">
          <div>
            <p className="eyebrow">Scan mode</p>
            <h2 id="scan-sheet-title">Barcode scanner</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {pausedBarcode ? (
          <div className="scan-summary">
            <p className="scan-summary-label">Scanned barcode</p>
            <strong>{pausedBarcode}</strong>
            <p className="scan-summary-copy">
              Tags were saved. Scan another barcode or finish and return to the
              list.
            </p>
            <div className="dialog-actions">
              <button
                className="secondary-button"
                onClick={onClose}
                type="button"
              >
                Done
              </button>
              <button
                className="primary-button"
                onClick={onScanAnother}
                type="button"
              >
                Scan another
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="scanner-stage">
              <div className="scanner-frame">
                <video
                  aria-label="Barcode scanner camera preview"
                  autoPlay
                  className="scanner-video"
                  muted
                  playsInline
                  ref={videoRef}
                />
              </div>
            </div>
            <p className="scan-note">
              {statusMessage ?? 'Point the barcode inside the square frame.'}
            </p>
          </>
        )}
      </section>
    </div>
  )
}
