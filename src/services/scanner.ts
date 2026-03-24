import { normalizeBarcode } from '../lib/items'
import type { BarcodeScanner, CameraOption, ScannerOptions } from '../types'

type TrackCapabilitiesWithFocus = MediaTrackCapabilities & {
  focusMode?: string[]
}

type FocusConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string
}

const BACK_CAMERA_LABELS = /(back|rear|environment|world|wide|ultra|tele|camera 0)/i
const BACK_CAMERA_ZERO_LABELS =
  /((back|rear|environment).*(camera\s*0|0\b))|((camera\s*0|0\b).*(back|rear|environment))/i
const FRONT_CAMERA_LABELS = /(front|user|facetime|selfie)/i
const TRANSIENT_DECODE_ERROR_NAMES = new Set([
  'ChecksumException',
  'FormatException',
  'NotFoundException',
  'ReaderException',
])

function getCameraLabel(device: MediaDeviceInfo, index: number): string {
  const label = device.label.trim()

  return label || `Camera ${index + 1}`
}

function isTransientDecodeError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false
  }

  return (
    TRANSIENT_DECODE_ERROR_NAMES.has(error.name) ||
    /no multiformat readers? w(?:ere|here) able to detect the code/i.test(
      error.message,
    )
  )
}

async function getAvailableVideoInputs(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return []
  }

  const devices = await navigator.mediaDevices.enumerateDevices()

  return devices.filter((device) => device.kind === 'videoinput')
}

function getPreferredRearCameraId(
  videoInputs: MediaDeviceInfo[],
): string | undefined {
  const cameraZeroFacingBack = videoInputs.find((device) =>
    BACK_CAMERA_ZERO_LABELS.test(device.label),
  )

  if (cameraZeroFacingBack) {
    return cameraZeroFacingBack.deviceId
  }

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

export async function listAvailableCameras(): Promise<{
  cameras: CameraOption[]
  preferredCameraId?: string
}> {
  const videoInputs = await getAvailableVideoInputs()

  return {
    cameras: videoInputs.map((device, index) => ({
      id: device.deviceId,
      label: getCameraLabel(device, index),
    })),
    preferredCameraId: getPreferredRearCameraId(videoInputs),
  }
}

function getPreferredConstraintValue(
  capabilities: TrackCapabilitiesWithFocus,
  preferredModes: string[],
): FocusConstraintSet | null {
  for (const focusMode of preferredModes) {
    if (capabilities.focusMode?.includes(focusMode)) {
      return { focusMode }
    }
  }

  return null
}

async function applyPreferredFocus(
  videoElement: HTMLVideoElement,
  preferredModes: string[] = ['continuous', 'single-shot'],
): Promise<boolean> {
  const track = getActiveVideoTrack(videoElement)

  if (!track || typeof track.getCapabilities !== 'function') {
    return false
  }

  const capabilities = track.getCapabilities() as TrackCapabilitiesWithFocus
  const preferredFocus = getPreferredConstraintValue(capabilities, preferredModes)

  if (!preferredFocus) {
    return false
  }

  try {
    await track.applyConstraints({
      advanced: [preferredFocus as MediaTrackConstraintSet],
    })

    return true
  } catch {
    // Focus-related constraints are uneven across devices, so ignore failures.
    return false
  }
}

async function getDefaultCameraId(): Promise<string | undefined> {
  const videoInputs = await getAvailableVideoInputs()
  const preferredRearCameraId = getPreferredRearCameraId(videoInputs)

  if (preferredRearCameraId) {
    return preferredRearCameraId
  }

  return videoInputs[0]?.deviceId
}

function getActiveVideoTrack(videoElement: HTMLVideoElement): MediaStreamTrack | null {
  const stream = videoElement.srcObject

  if (!(stream instanceof MediaStream)) {
    return null
  }

  return stream.getVideoTracks()[0] ?? null
}

export function createBarcodeScanner(
  options: ScannerOptions = {},
): BarcodeScanner {
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

      const [
        { BrowserMultiFormatReader },
        { BarcodeFormat, DecodeHintType, ReaderException },
      ] =
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
        const cameraId = options.deviceId ?? (await getDefaultCameraId())

        controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              ...(cameraId
                ? { deviceId: { exact: cameraId } }
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

            if (
              error &&
              !(error instanceof ReaderException) &&
              !isTransientDecodeError(error)
            ) {
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
    async focus() {
      if (!activeVideo) {
        return false
      }

      return applyPreferredFocus(activeVideo, ['single-shot', 'continuous'])
    },
    stop,
  }
}
