export type TagOption = {
  id: string
  label: string
}

export type ScannedItem = {
  barcode: string
  tags: string[]
  comment: string
  firstScannedAt: string
  lastScannedAt: string
  scanCount: number
}

export type CsvRow = {
  barcode: string
  tags: string
  comment: string
  firstScannedAt: string
  lastScannedAt: string
  scanCount: number
}

export type CsvParseResult = {
  items: ScannedItem[]
  errors: string[]
}

export type CameraOption = {
  id: string
  label: string
}

export type ScannerOptions = {
  deviceId?: string
}

export type BarcodeScanner = {
  start: (
    videoElement: HTMLVideoElement,
    onDetected: (barcode: string) => void,
    onStatusChange: (message: string | null) => void,
  ) => Promise<void>
  focus: () => Promise<boolean>
  stop: () => void
}

export type CreateBarcodeScanner = (options?: ScannerOptions) => BarcodeScanner

export type TagDraft = {
  tags: string[]
  comment: string
}

export type ScannerRepository = {
  getAllItems: () => Promise<ScannedItem[]>
  upsertScan: (
    barcode: string,
    tags: string[],
    comment?: string,
    scannedAt?: string,
  ) => Promise<ScannedItem>
  deleteItem: (barcode: string) => Promise<void>
  importItems: (items: ScannedItem[]) => Promise<void>
}
