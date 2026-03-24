import { normalizeBarcode } from '../lib/items'
import type { BarcodeScanner } from '../types'

type TrackCapabilitiesWithFocus = MediaTrackCapabilities & {
  focusMode?: string[]
}

type FocusConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
}

const BACK_CAMERA_LABELS = /(back|rear|environment|world|wide|ultra|tele|camera 0)/i
const FRONT_CAMERA_LABELS = /(front|user|facetime|selfie)/i

async function getPreferredRearCameraId(): Promise<string | undefined> {
  const devices = await navigator.mediaDevices.enumerateDevices()
  const videoInputs = devices.filter((device) => device.kind === 'videoinput')

  const preferredRearCamera = videoInputs.find((device) =>
    BACK_CAMERA_LABELS.test(device.label),
  )

  if (preferredRearCamera) {
    return preferredRearCamera.deviceId
  }

  const nonFrontCamera = videoInputs.find(
    (device) => !FRONT_CAMERA_LABELS.test(device.label),
  )

  return nonFrontCamera?.deviceId
}

function getActiveVideoTrack(videoElement: HTMLVideoElement): MediaStreamTrack | null {
  const stream = videoElement.srcObject

  if (!(stream instanceof MediaStream)) {
    return null
  }

  return stream.getVideoTracks()[0] ?? null
}

async function applyPreferredFocus(videoElement: HTMLVideoElement): Promise<void> {
  const track = getActiveVideoTrack(videoElement)

  if (!track || typeof track.getCapabilities !== 'function') {
    return
  }

  const capabilities = track.getCapabilities() as TrackCapabilitiesWithFocus
  const advanced: FocusConstraintSet[] = []

  if (capabilities.focusMode?.includes('continuous')) {
    advanced.push({ focusMode: 'continuous' })
  } else if (capabilities.focusMode?.includes('single-shot')) {
    advanced.push({ focusMode: 'single-shot' })
  }

  if (advanced.length === 0) {
    return
  }

  try {
    await track.applyConstraints({
      advanced: advanced as MediaTrackConstraintSet[],
    })
  } catch {
    // Focus-related constraints are uneven across devices, so ignore failures.
  }
}

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
        const preferredRearCameraId = await getPreferredRearCameraId()

        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              ...(preferredRearCameraId
                ? { deviceId: { exact: preferredRearCameraId } }
                : { facingMode: { ideal: 'environment' } }),
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

        await applyPreferredFocus(videoElement)
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
