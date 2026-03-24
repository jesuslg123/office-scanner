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

import { createBarcodeScanner } from './scanner'

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
})
