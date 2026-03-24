# Office Scanner

Minimalist offline barcode scanner for iOS, Android, and the browser. The app scans common linear barcodes with the device camera, prompts for workspace tags after each scan, stores results locally in IndexedDB, and supports CSV import/export.

## Features

- Single-screen inventory list sorted by last scan date
- Preloaded workspace tags with match-any filtering
- Compact square camera preview inside a scan sheet
- Duplicate barcode merge behavior with tag union and scan count tracking
- CSV export and CSV re-import
- Capacitor projects for iOS and Android

## Commands

```bash
npm install
npm run dev
npm run build
npm test
npm run lint
npm run cap:sync
npm run ios
npm run android
```

## Notes

- Local app data is stored on-device only.
- Native CSV export uses the system share sheet through Capacitor.
- iOS and Android native projects already include camera permission metadata for scanning.
