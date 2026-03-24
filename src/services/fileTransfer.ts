import { Capacitor } from '@capacitor/core'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

export async function exportCsvFile(
  fileName: string,
  contents: string,
): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const path = `exports/${fileName}`

    await Filesystem.writeFile({
      path,
      data: contents,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    })

    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    })
    const { value } = await Share.canShare()

    if (value) {
      await Share.share({
        title: 'Export scanned items',
        text: 'Scanned barcode export',
        files: [uri],
        dialogTitle: 'Export scanned items',
      })
      return
    }
  }

  const blob = new Blob([contents], { type: 'text/csv;charset=utf-8' })
  const downloadUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = downloadUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(downloadUrl)
}
