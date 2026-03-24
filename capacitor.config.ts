import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.example.officescanner',
  appName: 'Office Scanner',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
