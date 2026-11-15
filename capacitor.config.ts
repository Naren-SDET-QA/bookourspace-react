import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bookourspace.app',
  appName: 'BookOurSpace',
  webDir: 'dist',
  server: {
    hostname: 'localhost',
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    // API calls are routed through Capacitor's native HTTP bridge on mobile.
    // This avoids WebView mixed-content blocking without enabling mixed content.
    CapacitorHttp: {
      enabled: true,
    },
    Keyboard: {
      // Resize the native WebView when the keyboard opens so vh-sized dialogs
      // remain scrollable with a focused field on iOS.
      resize: 'native',
    },
  },
};

export default config;
