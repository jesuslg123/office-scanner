import { normalizeBarcode } from '../lib/items'
import type { BarcodeScanner } from '../types'

export function createBarcodeScanner(): BarcodeScanner {
  let controls: { stop: () => void } | null = null
  let activeVideo: HTMLVideoElement | null = null
  let cleanVideoSource: ((video: HTMLVideoElement) => void) | null = null
  let stopped = true

  const stop = () => {
    stopped = true
    controls?.stop()
    controls = null

    if (activeVideo) {
      activeVideo.pause()
      cleanVideoSource?.(activeVideo)
      activeVideo = null
    }
  }

  return {
    async start(videoElement, onDetected, onStatusChange) {
      stop()

      if (!navigator.mediaDevices?.getUserMedia) {
        onStatusChange('Camera access is not supported on this device.')
        return
      }

      stopped = false
      activeVideo = videoElement
      activeVideo.muted = true
      activeVideo.playsInline = true

      const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] =
        await Promise.all([import('@zxing/browser'), import('@zxing/library')])

      cleanVideoSource = BrowserMultiFormatReader.cleanVideoSource

      const linearFormats = [
        BarcodeFormat.CODE_39,
        BarcodeFormat.CODE_93,
        BarcodeFormat.CODE_128,
        BarcodeFormat.CODABAR,
        BarcodeFormat.EAN_8,
        BarcodeFormat.EAN_13,
        BarcodeFormat.ITF,
        BarcodeFormat.UPC_A,
        BarcodeFormat.UPC_E,
      ]
      const hints = new Map([
        [DecodeHintType.POSSIBLE_FORMATS, linearFormats],
      ])
      const reader = new BrowserMultiFormatReader(hints, {
        delayBetweenScanAttempts: 180,
        delayBetweenScanSuccess: 900,
        tryPlayVideoTimeout: 5_000,
      })

      try {
        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: 'environment' },
              width: { ideal: 1280 },
              height: { ideal: 1280 },
            },
          },
          videoElement,
          (result, error, nextControls) => {
            controls = nextControls

            if (stopped) {
              return
            }

            if (result) {
              const barcode = normalizeBarcode(result.getText())

              if (barcode) {
                stop()
                onStatusChange(null)
                onDetected(barcode)
              }

              return
            }

            if (error && error.name !== 'NotFoundException') {
              onStatusChange(error.message || 'Unable to scan this barcode.')
              return
            }

            onStatusChange(null)
          },
        )
      } catch (error) {
        stop()
        onStatusChange(
          error instanceof Error
            ? error.message
            : 'Unable to access the camera.',
        )
      }
    },
    stop,
  }
}
