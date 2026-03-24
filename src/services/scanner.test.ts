import { beforeEach, describe, expect, it, vi } from 'vitest'

const zxingMocks = vi.hoisted(() => {
  const decodeFromConstraints = vi.fn()
  const cleanVideoSource = vi.fn()
  const BrowserMultiFormatReader = vi.fn().mockImplementation(() => ({
    decodeFromConstraints,
  }))

  class ReaderException extends Error {
    constructor(message = 'Reader error') {
      super(message)
      this.name = 'ReaderException'
    }
  }

  class NotFoundException extends ReaderException {
    constructor(message = 'No code found') {
      super(message)
      this.name = 'NotFoundException'
    }
  }

  return {
    BarcodeFormat: {
      CODABAR: 'CODABAR',
      CODE_39: 'CODE_39',
      CODE_93: 'CODE_93',
      CODE_128: 'CODE_128',
      EAN_8: 'EAN_8',
      EAN_13: 'EAN_13',
      ITF: 'ITF',
      UPC_A: 'UPC_A',
      UPC_E: 'UPC_E',
    },
    BrowserMultiFormatReader,
    cleanVideoSource,
    decodeFromConstraints,
    DecodeHintType: {
      POSSIBLE_FORMATS: 'POSSIBLE_FORMATS',
    },
    NotFoundException,
    ReaderException,
  }
})

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: Object.assign(zxingMocks.BrowserMultiFormatReader, {
    cleanVideoSource: zxingMocks.cleanVideoSource,
  }),
}))

vi.mock('@zxing/library', () => ({
  BarcodeFormat: zxingMocks.BarcodeFormat,
  DecodeHintType: zxingMocks.DecodeHintType,
  NotFoundException: zxingMocks.NotFoundException,
  ReaderException: zxingMocks.ReaderException,
}))

import { createBarcodeScanner, listAvailableCameras } from './scanner'

function createVideoElement() {
  const video = document.createElement('video')

  Object.defineProperty(video, 'pause', {
    configurable: true,
    value: vi.fn(),
  })

  return video
}

describe('createBarcodeScanner', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          enumerateDevices: vi.fn().mockResolvedValue([]),
          getUserMedia: vi.fn(),
        },
      },
    })
  })

  it('keeps transient decode loop errors silent', async () => {
    const statusChange = vi.fn()
    const scanner = createBarcodeScanner()
    const video = createVideoElement()

    zxingMocks.decodeFromConstraints.mockImplementation(
      async (
        _constraints: MediaStreamConstraints,
        _videoElement: HTMLVideoElement,
        callback: (
          result: unknown,
          error: Error | undefined,
          controls: { stop: () => void },
        ) => void,
      ) => {
        callback(
          null,
          new Error('No MultiFormat readers where able to detect the code.'),
          { stop: vi.fn() },
        )

        return { stop: vi.fn() }
      },
    )

    await scanner.start(video, vi.fn(), statusChange)

    expect(statusChange).toHaveBeenCalledWith(null)
    expect(
      statusChange,
    ).not.toHaveBeenCalledWith(
      'No MultiFormat readers where able to detect the code.',
    )
  })

  it('surfaces unexpected scanner callback errors', async () => {
    const statusChange = vi.fn()
    const scanner = createBarcodeScanner()
    const video = createVideoElement()

    zxingMocks.decodeFromConstraints.mockImplementation(
      async (
        _constraints: MediaStreamConstraints,
        _videoElement: HTMLVideoElement,
        callback: (
          result: unknown,
          error: Error | undefined,
          controls: { stop: () => void },
        ) => void,
      ) => {
        callback(null, new Error('Camera pipeline failed.'), { stop: vi.fn() })

        return { stop: vi.fn() }
      },
    )

    await scanner.start(video, vi.fn(), statusChange)

    expect(statusChange).toHaveBeenCalledWith('Camera pipeline failed.')
  })

  it('lists every available video input and keeps the preferred rear camera', async () => {
    vi.mocked(navigator.mediaDevices.enumerateDevices).mockResolvedValue([
      {
        deviceId: 'front-camera',
        groupId: 'front',
        kind: 'videoinput',
        label: 'Front Camera',
        toJSON() {
          return this
        },
      },
      {
        deviceId: 'rear-camera-0',
        groupId: 'rear',
        kind: 'videoinput',
        label: 'Camera 0, facing back',
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
      {
        deviceId: 'wide-camera',
        groupId: 'rear',
        kind: 'videoinput',
        label: 'Back Camera Wide',
        toJSON() {
          return this
        },
      },
    ])

    const result = await listAvailableCameras()

    expect(result.cameras).toEqual([
      { id: 'front-camera', label: 'Front Camera' },
      { id: 'rear-camera-0', label: 'Camera 0, facing back' },
      { id: 'tele-camera', label: 'Back Camera Telephoto' },
      { id: 'wide-camera', label: 'Back Camera Wide' },
    ])
    expect(result.preferredCameraId).toBe('rear-camera-0')
  })

  it('uses the selected camera id when starting the scanner', async () => {
    const statusChange = vi.fn()
    const scanner = createBarcodeScanner({ deviceId: 'tele-camera' })
    const video = createVideoElement()

    zxingMocks.decodeFromConstraints.mockResolvedValue({ stop: vi.fn() })

    await scanner.start(video, vi.fn(), statusChange)

    expect(zxingMocks.decodeFromConstraints).toHaveBeenCalledWith(
      expect.objectContaining({
        audio: false,
        video: expect.objectContaining({
          deviceId: { exact: 'tele-camera' },
        }),
      }),
      video,
      expect.any(Function),
    )
  })
})
