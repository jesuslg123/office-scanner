import { useEffect, useEffectEvent, useRef, useState } from 'react'

import { listAvailableCameras } from '../services/scanner'
import type { CameraOption, CreateBarcodeScanner } from '../types'

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
  const [availableCameras, setAvailableCameras] = useState<CameraOption[]>([])
  const [preferredCameraId, setPreferredCameraId] = useState<string | null>(null)
  const [selectedCameraId, setSelectedCameraId] = useState<string | 'auto'>('auto')
  const [isRefocusing, setIsRefocusing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  const handleDetected = useEffectEvent(onDetected)
  const syncAvailableCameras = useEffectEvent(async () => {
    try {
      const { cameras, preferredCameraId: nextPreferredCameraId } =
        await listAvailableCameras()

      setAvailableCameras(cameras)
      setPreferredCameraId(nextPreferredCameraId ?? cameras[0]?.id ?? null)
      setSelectedCameraId((current) =>
        current !== 'auto' && !cameras.some((camera) => camera.id === current)
          ? 'auto'
          : current,
      )
    } catch {
      setAvailableCameras([])
      setPreferredCameraId(null)
      setSelectedCameraId('auto')
    }
  })

  const handleRefocus = useEffectEvent(async () => {
    if (!scannerRef.current) {
      return
    }

    setIsRefocusing(true)
    setStatusMessage(null)

    try {
      const focused = await scannerRef.current.focus()

      if (!focused) {
        setStatusMessage('Refocus is not supported on this camera.')
      }
    } finally {
      setIsRefocusing(false)
    }
  })

  useEffect(() => {
    if (!open) {
      setStatusMessage(null)
      return
    }

    void syncAvailableCameras()
  }, [open])

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

    const scanner =
      selectedCameraId === 'auto'
        ? createScanner()
        : createScanner({ deviceId: selectedCameraId })

    scannerRef.current = scanner
    setStatusMessage(null)

    let active = true

    void (async () => {
      await scanner.start(videoRef.current!, handleDetected, setStatusMessage)

      if (!active) {
        return
      }

      await syncAvailableCameras()
    })()

    return () => {
      active = false
      scanner.stop()
      scannerRef.current = null
    }
  }, [createScanner, open, pausedBarcode, selectedCameraId])

  if (!open) {
    return null
  }

  const activeCameraId =
    selectedCameraId === 'auto'
      ? (preferredCameraId ?? availableCameras[0]?.id ?? '')
      : selectedCameraId

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
            <div className="scanner-toolbar">
              {availableCameras.length > 1 ? (
                <label className="field-group camera-field" htmlFor="scanner-camera">
                  <span className="field-label">Camera</span>
                  <select
                    className="select-input"
                    id="scanner-camera"
                    onChange={(event) => setSelectedCameraId(event.target.value)}
                    value={activeCameraId}
                  >
                    {availableCameras.map((camera) => (
                      <option key={camera.id} value={camera.id}>
                        {camera.label}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <button
                className="secondary-button scanner-action"
                disabled={isRefocusing}
                onClick={() => void handleRefocus()}
                type="button"
              >
                {isRefocusing ? 'Refocusing...' : 'Refocus'}
              </button>
            </div>
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
